// bulkUpdate (unnest-join by key + binary array params + adaptive chunking + atomic modes).
// Requires `bun run test:setup`.
import { test, expect, describe } from 'bun:test'
import { withConn, testPool, caught, PgError, TEST_TIMEOUT } from '../helpers/db.ts'

const K = `bu_${process.pid}`
const COLS = { id: 'int8', name: 'text', qty: 'int4', price: 'float8' } as const
const DDL = (t: string) => `create temp table ${t}(id int8 primary key, name text, qty int4, price float8)`
const seed = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `orig_${i}`, qty: i, price: i + 0.5 }))

describe('bulkUpdate', () => {
  test('updates matched rows, leaves others untouched; rowCount = matches', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_a`))
      await c.bulkInsert(`${K}_a`, COLS, seed(1000))
      const upd = Array.from({ length: 300 }, (_, i) => ({ id: i * 3 + 1, name: `upd_${i}`, qty: 100000 + i, price: 0.25 }))
      const r = await c.bulkUpdate(`${K}_a`, COLS, upd, { by: 'id' })
      expect(r.command).toBe('UPDATE')
      expect(r.rowCount).toBe(300)
      const chk = await c.query(`select (count(*) filter (where qty >= 100000))::int4, (count(*) filter (where name like 'orig%'))::int4 from ${K}_a`)
      expect((chk.rows[0] as unknown[])[0]).toBe(300)
      expect((chk.rows[0] as unknown[])[1]).toBe(700)
      const one = await c.query(`select name, qty, price from ${K}_a where id = 4`)
      expect(one.rows[0]).toEqual(['upd_1', 100001, 0.25] as never)
    })
  }, TEST_TIMEOUT)

  test('array rows, SET to NULL, unmatched keys lower rowCount', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_b`))
      await c.bulkInsert(`${K}_b`, COLS, seed(10))
      const r = await c.bulkUpdate(`${K}_b`, COLS, [
        [1, null, 7, null],      // set name/price to NULL
        [999999, 'ghost', 0, 0], // matches nothing
      ], { by: 'id' })
      expect(r.rowCount).toBe(1)
      const got = await c.query(`select name, qty, price from ${K}_b where id = 1`)
      expect(got.rows[0]).toEqual([null, 7, null] as never)
    })
  }, TEST_TIMEOUT)

  test('composite key (by: [a, b])', async () => {
    await withConn(async (c) => {
      await c.query(`create temp table ${K}_ck(tenant int4, id int4, v text, primary key (tenant, id))`)
      await c.query(`insert into ${K}_ck select t, i, 'o' from generate_series(1,3) t, generate_series(1,5) i`)
      const r = await c.bulkUpdate(`${K}_ck`, { tenant: 'int4', id: 'int4', v: 'text' }, [
        { tenant: 1, id: 2, v: 'x' }, { tenant: 3, id: 4, v: 'y' },
      ], { by: ['tenant', 'id'] })
      expect(r.rowCount).toBe(2)
      const chk = await c.query(`select count(*)::int4 from ${K}_ck where v <> 'o'`)
      expect((chk.rows[0] as unknown[])[0]).toBe(2)
    })
  }, TEST_TIMEOUT)

  test('returning works; duplicate input keys update the target once (indeterminate winner)', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_d`))
      await c.bulkInsert(`${K}_d`, COLS, seed(5))
      const r = await c.bulkUpdate(`${K}_d`, COLS, [
        { id: 2, name: 'first', qty: 1, price: 1 },
        { id: 2, name: 'second', qty: 2, price: 2 }, // same key twice
      ], { by: 'id', returning: 'id, name' })
      expect(r.rowCount).toBe(1) // target row counted once
      expect(r.rows.length).toBe(1)
      expect(['first', 'second']).toContain((r.rows[0] as unknown as string[])[1]!) // winner is indeterminate
    })
  }, TEST_TIMEOUT)

  test('chunked atomic default: failing chunk rolls back all chunks', async () => {
    await withConn(async (c) => {
      await c.query(`create temp table ${K}_at(id int8 primary key, name text not null, qty int4, price float8)`)
      await c.bulkInsert(`${K}_at`, COLS, seed(300))
      const upd = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, name: `u_${i}`, qty: 0, price: 0 }))
      ;(upd[250] as Record<string, unknown>).name = null // violates NOT NULL in the 3rd chunk
      const e = (await caught(() => c.bulkUpdate(`${K}_at`, COLS, upd, { by: 'id', chunk: 100 }))) as PgError
      expect(e.code).toBe('23502')
      const n = await c.query(`select count(*)::int4 from ${K}_at where name like 'u\\_%'`)
      expect((n.rows[0] as unknown[])[0]).toBe(0) // chunks 1+2 rolled back too
    })
  }, TEST_TIMEOUT)

  test('atomic:false: prior chunks stay, error carries updatedRows', async () => {
    await withConn(async (c) => {
      await c.query(`create temp table ${K}_wf(id int8 primary key, name text not null, qty int4, price float8)`)
      await c.bulkInsert(`${K}_wf`, COLS, seed(300))
      const upd = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, name: `u_${i}`, qty: 0, price: 0 }))
      ;(upd[250] as Record<string, unknown>).name = null
      const e = (await caught(() => c.bulkUpdate(`${K}_wf`, COLS, upd, { by: 'id', chunk: 100, atomic: false }))) as PgError & { updatedRows?: number }
      expect(e.code).toBe('23502')
      expect(e.updatedRows).toBe(200)
      const n = await c.query(`select count(*)::int4 from ${K}_wf where name like 'u\\_%'`)
      expect((n.rows[0] as unknown[])[0]).toBe(200)
    })
  }, TEST_TIMEOUT)

  test('validation: missing/unknown by, no SET columns', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_v`))
      expect(String(await caught(() => c.bulkUpdate(`${K}_v`, COLS, [], { by: 'nope' })))).toContain('not in columns')
      expect(String(await caught(() => c.bulkUpdate(`${K}_v`, { id: 'int8' }, [], { by: 'id' })))).toContain('no SET columns')
      expect(String(await caught(() => c.bulkUpdate(`${K}_v`, COLS, [], { by: [] })))).toContain('at least one key column')
    })
  }, TEST_TIMEOUT)

  test('repeat calls reuse ONE prepared statement; insert+update metas coexist', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_r`))
      await c.bulkInsert(`${K}_r`, COLS, seed(50))
      for (let i = 0; i < 3; i++) await c.bulkUpdate(`${K}_r`, COLS, [{ id: 1, name: `n${i}`, qty: i, price: i }], { by: 'id' })
      const pp = await c.query("select count(*)::int4 from pg_prepared_statements where name like '\\_um%'")
      expect((pp.rows[0] as unknown[])[0]).toBe(1)
    })
  }, TEST_TIMEOUT)

  test('pool.bulkUpdate', async () => {
    const pool = testPool({ max: 2 })
    try {
      await pool.execute(`create table ${K}_p(id int8 primary key, name text, qty int4, price float8)`)
      await pool.bulkInsert(`${K}_p`, COLS, seed(100))
      const r = await pool.bulkUpdate(`${K}_p`, COLS, seed(100).map((x) => ({ ...x, qty: x.qty + 5000 })), { by: 'id' })
      expect(r.rowCount).toBe(100)
    } finally {
      await pool.execute(`drop table if exists ${K}_p`)
      await pool.end()
    }
  }, TEST_TIMEOUT)
})

describe('onProgress', () => {
  test('bulkInsert: per-chunk callbacks, monotone cumulative rows/bytes/elapsed', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_pg`))
      const rows = seed(500)
      const events: { rows: number; bytes: number; elapsedMs: number; chunk: number; chunks: number; affected: number; totalRows: number }[] = []
      const r = await c.bulkInsert(`${K}_pg`, COLS, rows, { chunk: 100, onProgress: (p) => events.push({ ...p }) })
      expect(r.rowCount).toBe(500)
      expect(events.length).toBe(5)
      expect(events.map((e) => e.chunk)).toEqual([1, 2, 3, 4, 5])
      expect(events[4]!.rows).toBe(500)
      expect(events[4]!.affected).toBe(500)
      expect(events[4]!.totalRows).toBe(500)
      expect(events[4]!.chunks).toBe(5)
      for (let i = 1; i < 5; i++) {
        expect(events[i]!.rows).toBeGreaterThan(events[i - 1]!.rows)
        expect(events[i]!.bytes).toBeGreaterThan(events[i - 1]!.bytes)
        expect(events[i]!.elapsedMs).toBeGreaterThanOrEqual(events[i - 1]!.elapsedMs)
      }
      expect(events[0]!.bytes).toBeGreaterThan(1000) // real wire bytes, not zero
    })
  }, TEST_TIMEOUT)

  test('bulkUpdate: affected can lag rows (unmatched keys); single-statement path fires once', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_pu`))
      await c.bulkInsert(`${K}_pu`, COLS, seed(100))
      const upd = Array.from({ length: 60 }, (_, i) => ({ id: i < 50 ? i + 1 : 900000 + i, name: 'u', qty: 0, price: 0 }))
      const events: { rows: number; affected: number }[] = []
      const r = await c.bulkUpdate(`${K}_pu`, COLS, upd, { by: 'id', onProgress: (p) => events.push({ rows: p.rows, affected: p.affected }) })
      expect(r.rowCount).toBe(50)
      expect(events.length).toBe(1) // 60 rows < adaptive chunk -> single statement
      expect(events[0]!.rows).toBe(60)
      expect(events[0]!.affected).toBe(50) // 10 ghost keys matched nothing
    })
  }, TEST_TIMEOUT)

  test('copyMany: chunked progress with real COPY payload bytes', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_pc`))
      const rows = seed(400)
      const events: { rows: number; bytes: number; chunks: number }[] = []
      const r = await c.copyMany(`${K}_pc`, COLS, rows, { chunk: 100, onProgress: (p) => events.push({ rows: p.rows, bytes: p.bytes, chunks: p.chunks }) })
      expect(r.rowCount).toBe(400)
      expect(events.length).toBe(4)
      expect(events[3]!.rows).toBe(400)
      expect(events[3]!.chunks).toBe(4)
      expect(events[0]!.bytes).toBeGreaterThan(2000) // CopyData payload counted, not just the 'Q' message
      expect(events[3]!.bytes).toBeGreaterThan(events[0]!.bytes)
    })
  }, TEST_TIMEOUT)
})
