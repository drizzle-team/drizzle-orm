// cursor(): lazy server-side cursors on Pool + Connection with abandonment guards.
import { test, expect, describe } from 'bun:test'
import { testPool, withConn, TEST_TIMEOUT } from '../helpers/db.ts'

const K = `cur_${process.pid}`

describe('cursor()', () => {
  test('pool.cursor: sync creation, lazy open, batches, params, auto-close on exhaustion', async () => {
    const pool = testPool({ max: 2 })
    try {
      const cur = pool.cursor({ sql: 'select g as id from generate_series(1, $1::int4) g', params: [25], fetchSize: 10 })
      expect(pool.size).toBe(0) // nothing acquired yet — creation is lazy
      const b1 = await cur.next()
      expect(b1!.length).toBe(10)
      expect(b1![0]).toEqual({ id: 1 })
      const b2 = await cur.next()
      expect(b2![9]).toEqual({ id: 20 })
      const b3 = await cur.next() // 5 rows < fetchSize -> final batch, auto-closes
      expect(b3!.length).toBe(5)
      expect(await cur.next()).toBeNull()
      expect(await cur.next()).toBeNull() // idempotent
      expect(pool.idleCount).toBe(1) // connection went back to the pool
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('for-await iterates ROWS; break closes and releases; batches() iterates batches', async () => {
    const pool = testPool({ max: 1 })
    try {
      const cur = pool.cursor({ sql: 'select g from generate_series(1, 100) g', fetchSize: 10 })
      let rows = 0
      for await (const row of cur) {
        expect(row).toEqual({ g: rows + 1 })
        if (++rows === 25) break // mid-batch break -> generator finally -> close()
      }
      expect(rows).toBe(25)
      expect(pool.idleCount).toBe(1) // released despite early break
      const bcur = pool.cursor({ sql: 'select g from generate_series(1, 30) g', fetchSize: 10 })
      let batches = 0
      for await (const batch of bcur.batches()) { expect(batch.length).toBe(10); batches++ }
      expect(batches).toBe(3)
      const r = await pool.execute('select 1') // pool still healthy
      expect(r.rowCount).toBe(1)
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('close() early is idempotent; connection reusable afterwards', async () => {
    await withConn(async (c) => {
      const cur = c.cursor({ sql: 'select g from generate_series(1, 1000) g', fetchSize: 10 })
      await cur.next()
      await cur.close()
      await cur.close()
      expect(await cur.next()).toBeNull()
      const r = await c.query('select 42 as v') // tx committed, connection fine
      expect((r.rows[0] as unknown[])[0]).toBe(42)
    })
  }, TEST_TIMEOUT)

  test('idleTimeoutMs: abandoned cursor rolls back; connection SURVIVES and returns to the pool', async () => {
    const pool = testPool({ max: 1 })
    try {
      const cur = pool.cursor({ sql: 'select g from generate_series(1, 100) g', fetchSize: 10, idleTimeoutMs: 150 })
      await cur.next()
      await Bun.sleep(500) // consumer hangs holding the batch
      const e = await cur.next().then(() => null, (err: Error) => err)
      expect(String(e?.message)).toMatch(/idle/i)
      // non-destructive abort: the SAME pooled connection is healthy and reusable
      const r = await pool.execute('select 7 as v', [], { mode: 'array' })
      expect((r.rows[0] as unknown as unknown[])[0]).toBe(7)
      expect(pool.size).toBe(1) // never had to open a second connection
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('maxDurationMs: slow drain hits the ceiling', async () => {
    const pool = testPool({ max: 1 })
    try {
      const cur = pool.cursor({ sql: 'select g from generate_series(1, 50) g', fetchSize: 10, maxDurationMs: 200, idleTimeoutMs: 0 })
      const err = await (async () => {
        try {
          for await (const _b of cur) { void _b; await Bun.sleep(120) }
          return null
        } catch (e) { return e as Error }
      })()
      expect(String(err?.message)).toMatch(/maxDurationMs/)
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('all(): drains into one exact-size array; remainder mid-iteration; [] when exhausted', async () => {
    const pool = testPool({ max: 1 })
    try {
      const rows = await pool.cursor({ sql: 'select g as id from generate_series(1, 12345) g', fetchSize: 1000 }).all()
      expect(rows.length).toBe(12345)
      expect(rows[0]).toEqual({ id: 1 })
      expect(rows[12344]).toEqual({ id: 12345 })
      expect(pool.idleCount).toBe(1) // auto-closed, lease released
      const cur = pool.cursor({ sql: 'select g from generate_series(1, 100) g', fetchSize: 30 })
      const first = await cur.next()
      expect(first!.length).toBe(30)
      const rest = await cur.all() // remaining rows only
      expect(rest.length).toBe(70)
      expect(rest[0]).toEqual({ g: 31 })
      expect(await cur.all()).toEqual([]) // exhausted
      const drained = await pool.cursor({ sql: 'select g from generate_series(1, 5) g' }).drain() // alias
      expect(drained.length).toBe(5)
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('shape option decodes through the cursor', async () => {
    await withConn(async (c) => {
      const cur = c.cursor({
        sql: `select g::int8 as id, '(1.5,2.5)'::point as loc from generate_series(1, 3) g`,
        fetchSize: 2,
        shape: { id: 'bigint:number', loc: 'point:xy' },
      })
      const b1 = await cur.next()
      expect(b1![0]).toEqual({ id: 1, loc: { x: 1.5, y: 2.5 } })
      await cur.close()
    })
  }, TEST_TIMEOUT)

  test(`errors in the cursor SQL surface on first next() and release the lease`, async () => {
    const pool = testPool({ max: 1 })
    try {
      const cur = pool.cursor({ sql: `select * from ${K}_nope` })
      const e = await cur.next().then(() => null, (err: Error) => err)
      expect(String(e?.message)).toMatch(/does not exist/)
      expect(await pool.execute('select 1').then(() => true)).toBe(true) // released + reusable
    } finally { await pool.end() }
  }, TEST_TIMEOUT)
})
