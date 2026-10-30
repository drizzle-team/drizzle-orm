// Drives the REAL driver against the in-process MockPgServer — fully deterministic,
// no PostgreSQL instance. Proves the mock + exercises protocol/fault paths.
import { test, expect, describe } from 'bun:test'
import { connect, PgError } from '../../src/index.ts'
import { MockPgServer, type MockOptions } from '../mock/server.ts'

async function withMock<T>(opts: MockOptions, fn: (m: MockPgServer) => Promise<T>): Promise<T> {
  const m = await MockPgServer.start(opts)
  try { return await fn(m) } finally { await m.close() }
}
const tick = () => new Promise((r) => setTimeout(r, 20))

describe('MockPgServer: happy path', () => {
  test('canned result decodes per RowDescription oid', async () => {
    await withMock({ onQuery: () => ({ fields: [{ name: 'n', oid: 23 }, { name: 's', oid: 25 }], rows: [['42', 'hi']], command: 'SELECT' }) }, async (m) => {
      const c = await connect(m.connectConfig())
      const r = await c.query('select 42, $1', ['hi'])
      expect((r.rows[0] as unknown[])[0]).toBe(42)     // oid 23 int4 -> number
      expect((r.rows[0] as unknown[])[1]).toBe('hi')   // oid 25 text -> string
      expect(r.columns).toEqual(['n', 's'])
      expect(r.command).toBe('SELECT')
      expect(r.rowCount).toBe(1)
      await c.end()
    })
  })

  test('BackendKeyData is captured (needed for CancelRequest)', async () => {
    await withMock({}, async (m) => {
      const c = await connect(m.connectConfig())
      expect(typeof c.backendKey?.pid).toBe('number')
      expect(typeof c.backendKey?.secret).toBe('number')
      await c.end()
    })
  })
})

describe('MockPgServer: error injection', () => {
  test('an injected SQLSTATE rejects as PgError and the connection recovers', async () => {
    let fail = true
    await withMock({ onQuery: () => (fail ? { error: { code: '42P01', message: 'relation "x" does not exist' } } : { fields: [{ name: 'n', oid: 23 }], rows: [['7']], command: 'SELECT' }) }, async (m) => {
      const c = await connect(m.connectConfig())
      const err = await c.query('select * from x').catch((e) => e)
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('42P01')
      fail = false
      const ok = await c.query('select 7') // same connection recovers after Sync
      expect((ok.rows[0] as unknown[])[0]).toBe(7)
      await c.end()
    })
  })
})

describe('MockPgServer: fault injection', () => {
  test('drop-mid-query rejects the in-flight query and closes the connection', async () => {
    await withMock({}, async (m) => {
      const c = await connect(m.connectConfig())
      m.setMode('drop-mid-query')
      const err = await c.query('select 1').catch((e) => e)
      expect(err).toBeInstanceOf(Error)
      expect(c.state).toBe('closed')
    })
  })

  test('FATAL-then-close surfaces the 57P01 (admin shutdown), not a generic close error', async () => {
    await withMock({}, async (m) => {
      const c = await connect(m.connectConfig())
      m.setMode('fatal-then-close')
      const err = await c.query('select 1').catch((e) => e)
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('57P01')
    })
  })

  test('killing the socket while idle closes the connection; next query rejects', async () => {
    await withMock({}, async (m) => {
      const c = await connect(m.connectConfig())
      m.killActive()
      await tick()
      expect(c.state).toBe('closed')
      const err = await c.query('select 1').catch((e) => e)
      expect(err).toBeInstanceOf(Error)
    })
  })

  test('hang (no response) is reject-able via end() — no leaked promise', async () => {
    await withMock({}, async (m) => {
      const c = await connect(m.connectConfig())
      m.setMode('hang')
      const inflight = c.query('select 1').catch((e) => e)
      await c.end() // settles the hung query
      expect(await inflight).toBeInstanceOf(Error)
    })
  })
})

describe('MockPgServer: in-process transport (no TCP)', () => {
  test('minipg runs over an in-process duplex via the socket option', async () => {
    await withMock({ onQuery: () => ({ fields: [{ name: 'n', oid: 23 }], rows: [['7']], command: 'SELECT' }) }, async (m) => {
      const c = await connect({ host: 'in-process', port: 0, user: 'u', database: 'd', socket: () => m.inProcessConnect() })
      const r = await c.query('select 7')
      expect((r.rows[0] as unknown[])[0]).toBe(7)
      const r2 = await c.query('select $1::int', [42], { mode: 'object' })
      expect((r2.rows[0] as Record<string, unknown>).n).toBe(7) // mock echoes canned result
      await c.end()
    })
  })
})

describe('MockPgServer: prepared-statement / restart trap', () => {
  test('a forgotten prepared statement (post-restart) reuse: transparently re-parses (26000 swallowed)', async () => {
    // After the server loses state, reusing a cached name Binds a statement it no longer has -> 26000.
    // The driver drops its cache and re-runs once (Close + re-Parse), so the caller sees a normal result.
    await withMock({ onQuery: () => ({ fields: [{ name: 'n', oid: 23 }], rows: [['1']], command: 'SELECT' }) }, async (m) => {
      const c = await connect(m.connectConfig())
      await c.query('select $1::int', [1], { name: 'p1' }) // Parse + cache
      m.forgetStatements() // simulate restart losing server-side state
      const r = await c.query('select $1::int', [2], { name: 'p1', mode: 'object', debug: true }) // reuse -> 26000 -> auto re-parse
      expect((r.rows[0] as { n: unknown }).n).toBe(1)
      expect(r.debug!.retries).toBe(1)
      expect(r.debug!.retriedErrors).toEqual(['26000'])
      await c.end()
    })
  })
})
