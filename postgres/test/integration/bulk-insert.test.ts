// bulkInsert (unnest + binary array params) end-to-end, plus array params on plain queries.
// Requires `bun run test:setup`.
import { test, expect, describe } from 'bun:test'
import { withConn, testPool, caught, PgError, TEST_TIMEOUT } from '../helpers/db.ts'

const K = `im_${process.pid}`
const COLS = { id: 'int8', name: 'text', qty: 'int4', price: 'float8', ok: 'bool', at: 'timestamptz' } as const
const DDL = (t: string) => `create temp table ${t}(id int8, name text, qty int4, price float8, ok bool, at timestamptz)`

const mkRow = (i: number): unknown[] => [
  i + 1, `n_${i} "q" \\s`, i % 100, i + 0.25, i % 2 === 0, new Date(Date.UTC(2026, 0, 1) + i * 1000),
]

describe('bulkInsert', () => {
  test('roundtrip vs per-row text inserts: identical stored values', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_a`))
      const rows = Array.from({ length: 500 }, (_, i) => mkRow(i))
      const r = await c.bulkInsert(`${K}_a`, COLS, rows)
      expect(r.rowCount).toBe(500)
      for (const row of rows.slice(0, 50)) await c.query(`insert into ${K}_a values ($1,$2,$3,$4,$5,$6)`, row as unknown[])
      const chk = await c.query(`select count(*)::int4, count(distinct (id,name,qty,price,ok,at))::int4 from ${K}_a`)
      expect((chk.rows[0] as unknown as unknown[])[0]).toBe(550)
      expect((chk.rows[0] as unknown as unknown[])[1]).toBe(500) // the 50 re-inserted rows matched exactly
    })
  }, TEST_TIMEOUT)

  test('record rows, NULL cells, returning, empty batch', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_b`))
      const recs = [
        { id: 1, name: null, qty: 5, price: 0.5, ok: true, at: new Date('2026-02-03T04:05:06.007Z') },
        { id: 2, name: 'x', qty: null, price: null, ok: null, at: null },
      ]
      const r = await c.bulkInsert(`${K}_b`, COLS, recs, { returning: 'id, name' })
      expect(r.rowCount).toBe(2)
      expect(r.rows.map((x) => (x as unknown[])[0])).toEqual([1n, 2n]) // int8 decodes as BigInt by default
      expect((r.rows[1] as unknown as unknown[])[1]).toBe('x')
      const empty = await c.bulkInsert(`${K}_b`, COLS, [])
      expect(empty.rowCount).toBe(0)
      const nulls = await c.query(`select name, qty, price, ok, at from ${K}_b where id = 2`)
      expect((nulls.rows[0] as unknown as unknown[]).slice(1)).toEqual([null, null, null, null])
    })
  }, TEST_TIMEOUT)

  test('repeat calls reuse ONE prepared statement (auto-named)', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_c`))
      await c.bulkInsert(`${K}_c`, COLS, [mkRow(0)])
      await c.bulkInsert(`${K}_c`, COLS, [mkRow(1), mkRow(2)])
      await c.bulkInsert(`${K}_c`, COLS, Array.from({ length: 100 }, (_, i) => mkRow(i + 3)))
      const pp = await c.query("select count(*)::int4 from pg_prepared_statements where name like '\\_im%'")
      expect((pp.rows[0] as unknown as unknown[])[0]).toBe(1)
      const n = await c.query(`select count(*)::int4 from ${K}_c`)
      expect((n.rows[0] as unknown as unknown[])[0]).toBe(103)
    })
  }, TEST_TIMEOUT)

  test('quoted identifiers (table + column needing escapes)', async () => {
    await withConn(async (c) => {
      await c.query(`create temp table "${K} weird""tbl"("select" int4, "a b" text)`)
      const r = await c.bulkInsert(`${K} weird"tbl`, { select: 'int4', 'a b': 'text' } as never, [[1, 'x'], [2, 'y']])
      expect(r.rowCount).toBe(2)
    })
  }, TEST_TIMEOUT)

  test('auto-chunking: 25k rows -> pipelined chunk statements, ONE prepared name, ordered returning', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_ck`))
      const rows = Array.from({ length: 25_000 }, (_, i) => mkRow(i))
      const r = await c.bulkInsert(`${K}_ck`, COLS, rows, { returning: 'id' })
      expect(r.rowCount).toBe(25_000)
      expect(r.rows.length).toBe(25_000)
      expect((r.rows[0] as unknown as unknown[])[0]).toBe(1n)
      expect((r.rows[24_999] as unknown as unknown[])[0]).toBe(25_000n) // chunk results merged in input order
      const pp = await c.query("select count(*)::int4 from pg_prepared_statements where name like '\\_im%'")
      expect((pp.rows[0] as unknown as unknown[])[0]).toBe(1) // partial last chunk reused the same statement
    })
  }, TEST_TIMEOUT)

  test('chunked call is ATOMIC: a failure in a later chunk rolls back every chunk', async () => {
    await withConn(async (c) => {
      await c.query(`create temp table ${K}_at(id int8 primary key, name text, qty int4, price float8, ok bool, at timestamptz)`)
      const rows = Array.from({ length: 250 }, (_, i) => mkRow(i))
      rows[200] = mkRow(0) // duplicate PK lands in the third chunk (chunk: 100)
      const e = (await caught(() => c.bulkInsert(`${K}_at`, COLS, rows, { chunk: 100 }))) as PgError
      expect(e.code).toBe('23505')
      const n = await c.query(`select count(*)::int4 from ${K}_at`)
      expect((n.rows[0] as unknown as unknown[])[0]).toBe(0) // chunks 1+2 rolled back too
    })
  }, TEST_TIMEOUT)

  test('chunked inside an OUTER transaction: no nested BEGIN; outer rollback discards it', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_ot`))
      const rows = Array.from({ length: 300 }, (_, i) => mkRow(i))
      const e = await caught(() => c.begin(async (tx) => {
        const r = await tx.bulkInsert(`${K}_ot`, COLS, rows, { chunk: 100 })
        expect(r.rowCount).toBe(300)
        throw new Error('force rollback')
      }))
      expect(String((e as Error).message)).toContain('force rollback')
      const n = await c.query(`select count(*)::int4 from ${K}_ot`)
      expect((n.rows[0] as unknown as unknown[])[0]).toBe(0)
    })
  }, TEST_TIMEOUT)

  test('atomic:false (WAL-friendly): failure keeps prior chunks and reports insertedRows', async () => {
    await withConn(async (c) => {
      await c.query(`create temp table ${K}_wf(id int8 primary key, name text, qty int4, price float8, ok bool, at timestamptz)`)
      const rows = Array.from({ length: 250 }, (_, i) => mkRow(i))
      rows[205] = mkRow(3) // duplicate PK in the 3rd chunk
      const e = (await caught(() => c.bulkInsert(`${K}_wf`, COLS, rows, { chunk: 100, atomic: false }))) as PgError & { insertedRows?: number }
      expect(e.code).toBe('23505')
      expect(e.insertedRows).toBe(200) // chunks 1+2 committed and stay
      const n = await c.query(`select count(*)::int4 from ${K}_wf`)
      expect((n.rows[0] as unknown as unknown[])[0]).toBe(200)
    })
  }, TEST_TIMEOUT)

  test('atomic:false inside an open transaction rejects loudly', async () => {
    await withConn(async (c) => {
      await c.query(DDL(`${K}_wtx`))
      const rows = Array.from({ length: 30 }, (_, i) => mkRow(i))
      const e = await caught(() => c.begin((tx) => tx.bulkInsert(`${K}_wtx`, COLS, rows, { chunk: 10, atomic: false })))
      expect(String((e as Error).message)).toContain('atomic:false inside an open transaction')
    })
  }, TEST_TIMEOUT)

  test('pool.bulkInsert', async () => {
    const pool = testPool({ max: 2 })
    try {
      await pool.execute(`create table ${K}_p(id int8, name text, qty int4, price float8, ok bool, at timestamptz)`)
      const r = await pool.bulkInsert(`${K}_p`, COLS, Array.from({ length: 50 }, (_, i) => mkRow(i)))
      expect(r.rowCount).toBe(50)
    } finally {
      await pool.execute(`drop table if exists ${K}_p`)
      await pool.end()
    }
  }, TEST_TIMEOUT)
})

describe('bulkInsert defaults:true', () => {
  const DCOLS = { id: 'int8', name: 'text', status: 'text', n: 'int4', at: 'timestamptz' } as const
  const DDDL = (t: string) => `create temp table ${t}(
    id int8 primary key, name text not null,
    status text default 'pending', n int4 not null default 7, at timestamptz default now())`

  test('without defaults:true, an undefined cell still becomes NULL (opt-in)', async () => {
    await withConn(async (c) => {
      await c.query(DDDL(`${K}_d0`))
      // n is NOT NULL with a default; the unnest path sends undefined as NULL -> 23502
      const e = (await caught(() => c.bulkInsert(`${K}_d0`, DCOLS, [{ id: 1, name: 'a' }]))) as PgError
      expect(e.code).toBe('23502')
    })
  }, TEST_TIMEOUT)

  test('undefined→DEFAULT, null→NULL, NOT NULL+default column no longer crashes', async () => {
    await withConn(async (c) => {
      await c.query(DDDL(`${K}_d1`))
      const rows = [
        { id: 1, name: 'a' },                                                    // status/n/at undefined -> DEFAULT
        { id: 2, name: 'b', status: null, n: 3 },                                // explicit null -> NULL; at -> DEFAULT
        { id: 3, name: 'c', status: 'x', n: 9, at: new Date('2020-01-01T00:00:00Z') },
      ]
      const r = await c.bulkInsert(`${K}_d1`, DCOLS, rows, { defaults: true })
      expect(r.rowCount).toBe(3)
      const got = await c.query(`select id, status, n, (at >= date '2024-01-01') as recent from ${K}_d1 order by id`, [], { mode: 'object' })
      expect(got.rows[0]).toMatchObject({ status: 'pending', n: 7, recent: true })  // all three defaults applied
      expect(got.rows[1]).toMatchObject({ status: null, n: 3, recent: true })       // null preserved, at still defaulted
      expect(got.rows[2]).toMatchObject({ status: 'x', n: 9, recent: false })       // provided values pass through
    })
  }, TEST_TIMEOUT)

  test('per-row volatile default: each DEFAULT cell gets its own nextval', async () => {
    await withConn(async (c) => {
      await c.query(`create temp sequence ${K}_seq`)
      await c.query(`create temp table ${K}_d2(id int8 primary key, tok int8 default nextval('${K}_seq'))`)
      const rows = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 })) // tok undefined -> DEFAULT on every row
      await c.bulkInsert(`${K}_d2`, { id: 'int8', tok: 'int8' }, rows, { defaults: true })
      const d = await c.query(`select count(distinct tok)::int4 from ${K}_d2`)
      expect((d.rows[0] as unknown as unknown[])[0]).toBe(20) // 20 distinct sequence values, not one shared value
    })
  }, TEST_TIMEOUT)

  test('uniform pattern: full chunks reuse ONE prepared statement, returning stays ordered', async () => {
    await withConn(async (c) => {
      await c.query(DDDL(`${K}_d3`))
      const rows = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, name: `r${i}` })) // same DEFAULT pattern, exact multiple of chunk
      const r = await c.bulkInsert(`${K}_d3`, DCOLS, rows, { defaults: true, chunk: 100, returning: 'id' })
      expect(r.rowCount).toBe(300)
      expect((r.rows[0] as unknown as unknown[])[0]).toBe(1n)
      expect((r.rows[299] as unknown as unknown[])[0]).toBe(300n) // chunk results merged in input order
      const pp = await c.query("select count(*)::int4 from pg_prepared_statements where name like '\\_iv%'")
      expect((pp.rows[0] as unknown as unknown[])[0]).toBe(1) // 3 identical 100-row chunks share one statement
    })
  }, TEST_TIMEOUT)

  test('array rows work, and pool.bulkInsert forwards the option', async () => {
    const pool = testPool({ max: 2 })
    try {
      await pool.execute(`create table ${K}_d4(id int8 primary key, name text not null, status text default 'pending', n int4 not null default 7)`)
      const rows = Array.from({ length: 10 }, (_, i) => [i + 1, `a_${i}`, undefined, undefined]) // status+n -> DEFAULT
      const r = await pool.bulkInsert(`${K}_d4`, { id: 'int8', name: 'text', status: 'text', n: 'int4' }, rows, { defaults: true })
      expect(r.rowCount).toBe(10)
      const chk = await pool.query(`select count(*)::int4 from ${K}_d4 where status = 'pending' and n = 7`, [], { mode: 'array' })
      expect((chk.rows[0] as unknown as unknown[])[0]).toBe(10)
    } finally {
      await pool.execute(`drop table if exists ${K}_d4`)
      await pool.end()
    }
  }, TEST_TIMEOUT)
})

describe('array params on plain queries', () => {
  test('declared array param, first unnamed execution', async () => {
    await withConn(async (c) => {
      const r = await c.query('select ($1)::text as v, array_length($1, 1) as n', [[10, null, 30]], { params: ['int8[]'] })
      expect((r.rows[0] as unknown as unknown[])[0]).toBe('{10,NULL,30}')
    })
  }, TEST_TIMEOUT)

  test('text[] roundtrips exotic strings without literal escaping bugs', async () => {
    await withConn(async (c) => {
      const weird = ['a"b', 'c\\d', '{e,f}', 'NULL', '', 'ünïcode ⚡', 'tab\there']
      const r = await c.query('select unnest($1) as v', [weird], { params: ['text[]'] })
      expect(r.rows.map((x) => (x as unknown[])[0])).toEqual(weird)
    })
  }, TEST_TIMEOUT)

  test('mismatched element falls back to literal and the server validates', async () => {
    await withConn(async (c) => {
      const r = await c.query('select ($1)::text as v', [[1, 2.5, 3]], { params: ['float8[]'] })
      expect((r.rows[0] as unknown as unknown[])[0]).toBe('{1,2.5,3}')
    })
  }, TEST_TIMEOUT)

  test('a JS array into jsonb: DECLARE jsonb (untyped array is now a PG literal, Option A)', async () => {
    await withConn(async (c) => {
      const r = await c.query('select ($1)::text as v', [[1, { a: 2 }]], { params: ['jsonb'] })
      expect((r.rows[0] as unknown as unknown[])[0]).toBe('[1, {"a": 2}]') // declared jsonb -> JSON.stringify, not a '{…}' literal
    })
  }, TEST_TIMEOUT)
})
