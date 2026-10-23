// Regression tests pinning the bug fixes found during test planning.
// Requires a running cluster: `bun run test:setup`.
import { test, expect, describe } from 'bun:test'
import { testConnect, testPool, caught, PgError, REMOTE } from '../../helpers/db.ts'

describe('settlement / liveness invariants', () => {
  test('a decoder throw rejects the query instead of crashing, and the connection recovers', async () => {
    const c = await testConnect({ types: { 23: () => { throw new Error('boom decode') } } }) // int4 decoder throws
    const err = await caught(() => c.query('select 1::int4 as x'))
    expect((err as Error).message).toMatch(/boom decode/)
    const ok = await c.query('select 2::text as y') // connection still usable
    expect((ok.rows[0] as unknown[])[0]).toBe('2')
    await c.end()
  })

  test('end() settles an in-flight query (no hung promise)', async () => {
    const c = await testConnect()
    const inflight = caught(() => c.query('select pg_sleep(5)'))
    await c.end()
    expect(await inflight).toBeInstanceOf(Error)
  })
})

describe('security', () => {
  test('object mode cannot be prototype-polluted by a __proto__ column', async () => {
    const c = await testConnect()
    const r = await c.query(`select '{"polluted":true}'::jsonb as "__proto__"`, [], { mode: 'object' })
    const row = r.rows[0] as Record<string, unknown>
    expect((row as { __proto__?: unknown }).__proto__).toEqual({ polluted: true } as unknown) // own key, not the prototype
    expect(({} as Record<string, unknown>).polluted).toBeUndefined() // global Object prototype untouched
    await c.end()
  })

  // asserts the local fixture password literal — skip on a remote target (REMOTE) where it differs.
  test.skipIf(REMOTE)('password is not enumerable on the connection config', async () => {
    const c = await testConnect()
    expect(Object.keys(c.cfg)).not.toContain('password') // not enumerable
    expect(JSON.stringify(c.cfg)).not.toContain('password') // no "password" key in serialized form
    expect(c.cfg.password).toBe('postgres') // still readable directly
    await c.end()
  })
})

describe('pool', () => {
  test('double release is a no-op (no idle inflation / corruption)', async () => {
    const pool = testPool({ max: 2 })
    const { client, release } = await pool.connect()
    void client
    release(); release() // double
    expect(pool.idleCount).toBe(1)
    const r = await pool.query('select 1')
    expect((r.rows[0] as unknown as unknown[])[0]).toBe(1)
    await pool.end()
  })

  test('end() rejects queued waiters (no hung acquire)', async () => {
    const pool = testPool({ max: 1 })
    const held = await pool.acquire() // holds the only slot
    void held
    const waiter = caught(() => pool.acquire()) // queued
    await pool.end()
    expect(await waiter).toBeInstanceOf(Error)
  })

  test('open transaction is rolled back before a connection is reused', async () => {
    const pool = testPool({ max: 1 })
    const h1 = await pool.connect()
    await h1.client.query('begin')
    await h1.client.query('create temp table rb_probe(i int)')
    expect(h1.client.inTransaction).toBe(true)
    h1.release() // in-tx -> ROLLBACK on release

    const h2 = await pool.connect() // same physical connection (max=1)
    expect(h2.client.inTransaction).toBe(false)
    const err = await caught(() => h2.client.query('select * from rb_probe')) // creation was rolled back
    expect((err as PgError).code).toBe('42P01')
    h2.release()
    await pool.end()
  })
})

describe('out-of-scope COPY does not hang', () => {
  test('COPY TO STDOUT rejects loudly (use copyTo); COPY FROM STDIN rejects (CopyFail); neither hangs', async () => {
    const c = await testConnect()
    const to = await caught(() => c.query('copy (select 1) to stdout'))
    expect((to as Error).message).toMatch(/use copyTo\(\)/) // was: resolved while silently discarding the payload
    await c.query('create temp table cpy(i int)')
    const err = await caught(() => c.query('copy cpy from stdin'))
    expect(err).toBeInstanceOf(PgError)
    await c.end()
  }, 10000)
})
