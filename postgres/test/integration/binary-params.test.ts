// Binary param encoding (prepared reuse + declared paramTypes) and the pipelined
// named-statement burst fix (42P05). Requires `bun run test:setup`.
import { test, expect, describe } from 'bun:test'
import { withConn, caught, PgError, TEST_TIMEOUT } from '../helpers/db.ts'

const K = `bp_${process.pid}`

describe('binary params on prepared reuse', () => {
  test('text (first + unnamed) and binary (reused) executions store IDENTICAL values', async () => {
    await withConn(async (c) => {
      await c.query(`create temp table ${K}_t(src text, i2 int2, i4 int4, i8 int8, f8 float8, b bool, ts timestamptz, tsn timestamp)`)
      const sql = `insert into ${K}_t values ($1,$2,$3,$4,$5,$6,$7,$8)`
      const row = (src: string) => [src, -123, -2147483648, Number.MAX_SAFE_INTEGER, 1234.5625, true, new Date('2026-07-05T12:34:56.789Z'), new Date('2400-06-15T07:08:09.123Z')]
      await c.query(sql, row('text')) // unnamed: always text
      const name = `${K}_ins`
      await c.query(sql, row('text'), { name })  // first named execution: text (OIDs unknown yet)
      await c.query(sql, row('binary'), { name }) // reuse: fast types go binary
      await c.query(sql, row('binary'), { name })
      // if text and binary encodings ever disagreed, distinct would be > 1
      const r = await c.query(`select count(*)::int4, count(distinct (i2,i4,i8,f8,b,ts,tsn))::int4 from ${K}_t`)
      expect((r.rows[0] as unknown[])[0]).toBe(4)
      expect((r.rows[0] as unknown[])[1]).toBe(1)
    })
  }, TEST_TIMEOUT)

  test('bigint beyond 2^53 rides binary int8 exactly', async () => {
    await withConn(async (c) => {
      const name = `${K}_big`
      const sql = 'select ($1)::text as v'
      const first = await c.query(sql, [9223372036854775807n], { name })
      const reused = await c.query(sql, [9223372036854775807n], { name })
      expect((first.rows[0] as unknown[])[0]).toBe('9223372036854775807')
      expect((reused.rows[0] as unknown[])[0]).toBe('9223372036854775807')
    })
  }, TEST_TIMEOUT)

  test('out-of-range value on reuse still raises the server 22003 (per-value text fallback)', async () => {
    await withConn(async (c) => {
      const name = `${K}_rng`
      const sql = 'select $1::int4 as v'
      await c.query(sql, [1], { name })
      const e = (await caught(() => c.query(sql, [2 ** 40], { name }))) as PgError
      expect(e.code).toBe('22003')
      const ok = await c.query(sql, [7], { name }) // connection/statement still healthy
      expect((ok.rows[0] as unknown[])[0]).toBe(7)
    })
  }, TEST_TIMEOUT)

  test('binaryParams: false keeps every execution text', async () => {
    await withConn(async (c) => {
      const name = `${K}_off`
      const sql = 'select ($1)::text as v'
      await c.query(sql, [5], { name })
      const r = await c.query(sql, [5], { name })
      expect((r.rows[0] as unknown[])[0]).toBe('5')
    }, { binaryParams: false })
  }, TEST_TIMEOUT)
})

describe('declared paramTypes: no round trip needed', () => {
  test('OIDs are pinned in Parse (pg_typeof sees the declared type, unnamed statement)', async () => {
    await withConn(async (c) => {
      const r = await c.query('select pg_typeof($1)::text as t', [42], { params: ['int8'] })
      expect((r.rows[0] as unknown[])[0]).toBe('bigint')
    })
  }, TEST_TIMEOUT)

  test('FIRST unnamed execution goes binary (float8 -0 sign survives, which text String(-0)="0" loses)', async () => {
    await withConn(async (c) => {
      const bin = await c.query('select ($1)::text as v', [-0], { params: ['float8'] })
      expect((bin.rows[0] as unknown[])[0]).toBe('-0') // binary IEEE double keeps the sign bit
      const txt = await c.query('select ($1::float8)::text as v', [-0]) // no declared types -> text param
      expect((txt.rows[0] as unknown[])[0]).toBe('0')
    })
  }, TEST_TIMEOUT)

  test('works with a named statement from the first execution and stays correct on reuse', async () => {
    await withConn(async (c) => {
      const PT = ['int8', 'timestamptz'] as const
      const name = `${K}_pt`
      const d = new Date('2026-01-02T03:04:05.678Z')
      const sql = "select ($1)::text as a, to_char($2 at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.MS') as b"
      for (let i = 0; i < 3; i++) {
        const r = await c.query(sql, [123456789012345, d], { name, params: PT })
        expect((r.rows[0] as unknown[])[0]).toBe('123456789012345')
        expect((r.rows[0] as unknown[])[1]).toBe('2026-01-02 03:04:05.678')
      }
    })
  }, TEST_TIMEOUT)
})

describe('pipelined named-statement burst (42P05 regression)', () => {
  test('N concurrent FIRST uses of one name all succeed with one Parse', async () => {
    await withConn(async (c) => {
      const name = `${K}_burst`
      const ps = Array.from({ length: 50 }, (_, i) => c.query('select ($1)::int4 as v', [i], { name }))
      const rs = await Promise.all(ps)
      rs.forEach((r, i) => expect((r.rows[0] as unknown[])[0]).toBe(i))
      const pp = await c.query('select count(*)::int4 from pg_prepared_statements where name = $1', [name])
      expect((pp.rows[0] as unknown[])[0]).toBe(1)
    })
  }, TEST_TIMEOUT)

  test('burst whose Parse fails: every task settles, the name is reusable afterwards', async () => {
    await withConn(async (c) => {
      const name = `${K}_bad`
      const errs = await Promise.all(
        Array.from({ length: 10 }, () => caught(() => c.query('select frum public.t', [], { name }))),
      )
      for (const e of errs) expect((e as PgError).code).toBe('42601')
      const ok = await c.query('select 1 as one', [], { name }) // stale-flagged -> Close+re-Parse
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    })
  }, TEST_TIMEOUT)

  test('same name, two different SQLs interleaved in one burst', async () => {
    await withConn(async (c) => {
      const name = `${K}_mix`
      const a = Array.from({ length: 5 }, (_, i) => c.query('select ($1)::int4 as v', [i], { name }))
      const b = Array.from({ length: 5 }, (_, i) => c.query('select ($1)::int4 + 100 as v', [i], { name }))
      const rs = await Promise.all([...a, ...b])
      rs.slice(0, 5).forEach((r, i) => expect((r.rows[0] as unknown[])[0]).toBe(i))
      rs.slice(5).forEach((r, i) => expect((r.rows[0] as unknown[])[0]).toBe(100 + i))
    })
  }, TEST_TIMEOUT)

  test('pool.batch with a shared named statement (the real-world shape that used to die)', async () => {
    const { testPool } = await import('../helpers/db.ts')
    const pool = testPool({ max: 1 })
    try {
      const qs = Array.from({ length: 20 }, (_, i) => pool.query('select ($1)::int4 as v', [i], { name: `${K}_pb` }))
      const rs = await pool.batch(qs)
      rs.forEach((r, i) => expect((r.rows[0] as unknown as unknown[])[0]).toBe(i))
    } finally {
      await pool.end()
    }
  }, TEST_TIMEOUT)
})
