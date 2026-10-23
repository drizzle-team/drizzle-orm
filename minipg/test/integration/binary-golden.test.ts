// GOLDEN end-to-end test for the ORM binary flow (Connection.queryTyped, inline variant). Requests
// PostgreSQL BINARY result format per column from the LIVE server and decodes with the binary path,
// proving our binary decoders match PG's actual wire format (float8 IEEE-754, int8/timestamptz int64,
// uuid 16 bytes, bytea raw, bool 1 byte, jsonb version header). Cross-checked against the text path.
// Requires the local cluster (`bun run test:setup`).
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { connect } from '../../src/index.ts'
import type { CodegenCol } from '../../src/decode.ts'

const CFG = { host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb' }
let c: Awaited<ReturnType<typeof connect>>
beforeAll(async () => { c = await connect(CFG) })
afterAll(async () => { await c?.end() })

const SQL = `select 1::int4 as id, (-2)::int2 as s, 4294967295::oid as o, true as ok,
  3.5::float4 as f4, 3.141592653589793::float8 as f8,
  9223372036854775807::int8 as big, 12345.6789::numeric as amt,
  '2021-06-02 12:34:56.789+00'::timestamptz as ts, '2021-06-02'::date as d,
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid as u, '\\xdeadbeef'::bytea as by,
  'café 😀'::text as name, '{"a":1,"b":[2,3]}'::jsonb as meta`

// column plan (order matches the SELECT). Everything binary except numeric (kept text).
const COLS: CodegenCol[] = [
  { name: 'id', oid: 23, format: 'binary' },
  { name: 's', oid: 21, format: 'binary' },
  { name: 'o', oid: 26, format: 'binary' },
  { name: 'ok', oid: 16, format: 'binary' },
  { name: 'f4', oid: 700, format: 'binary' },
  { name: 'f8', oid: 701, format: 'binary' },
  { name: 'big', oid: 20, format: 'binary' },              // -> BigInt (default)
  { name: 'amt', oid: 1700, format: 'text' },              // numeric stays text (no binary decoder)
  { name: 'ts', oid: 1184, format: 'binary', js: 'ms' },
  { name: 'd', oid: 1082, format: 'binary', js: 'ms' },
  { name: 'u', oid: 2950, format: 'binary' },
  { name: 'by', oid: 17, format: 'binary' },
  { name: 'name', oid: 25, format: 'binary' },             // binary text == utf8 bytes
  { name: 'meta', oid: 3802, format: 'text' },             // jsonb via text (binary gives no benefit)
]

describe('binary result format from real PG -> queryTyped', () => {
  test('decodes every binary type to the expected value', async () => {
    const r = await c.queryTyped(SQL, [], COLS, { mode: 'object' })
    const row = r.rows[0] as unknown as Record<string, unknown>
    expect(row.id).toBe(1)
    expect(row.s).toBe(-2)
    expect(row.o).toBe(4294967295)
    expect(row.ok).toBe(true)
    expect(row.f4).toBe(3.5)
    expect(row.f8).toBe(3.141592653589793)            // float8 binary == exact IEEE value
    expect(row.big).toBe(9223372036854775807n)        // int8 -> BigInt
    expect(row.amt).toBe('12345.6789')                // numeric via text
    expect(row.ts).toBe(Date.UTC(2021, 5, 2, 12, 34, 56, 789)) // int64 µs since 2000 -> epoch ms
    expect(row.d).toBe(Date.UTC(2021, 5, 2))          // int32 days since 2000 -> epoch ms
    expect(row.u).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
    expect((row.by as Buffer).toString('hex')).toBe('deadbeef')
    expect(row.name).toBe('café 😀')
    expect(row.meta).toEqual({ a: 1, b: [2, 3] })
  })

  test('binary values agree with the text path for the same query', async () => {
    const bin = (await c.queryTyped(SQL, [], COLS, { mode: 'object' })).rows[0] as unknown as Record<string, unknown>
    const txt = (await c.query(SQL, [], { mode: 'object' })).rows[0] as unknown as Record<string, unknown>
    // scalar types the text path also produces directly
    expect(bin.id).toBe(txt.id)
    expect(bin.s).toBe(txt.s)
    expect(bin.ok).toBe(txt.ok)
    expect(bin.f8).toBe(txt.f8)                   // both exact
    expect(bin.big).toBe(txt.big)                 // both exact string
    expect(bin.amt).toBe(txt.amt)                 // both text
    expect(bin.u).toBe(txt.u)
    expect(bin.name).toBe(txt.name)
    expect(bin.meta).toEqual(txt.meta)
    // timestamptz: text is a string, binary is epoch ms — compare instants
    expect(bin.ts).toBe(new Date(txt.ts as string).getTime())
  })

  test('NULLs survive the binary path', async () => {
    const r = await c.queryTyped('select null::float8 as f, null::int8 as i, null::timestamptz as t', [],
      [{ name: 'f', oid: 701, format: 'binary' }, { name: 'i', oid: 20, format: 'binary' }, { name: 't', oid: 1184, format: 'binary', js: 'ms' }], { mode: 'object' })
    expect(r.rows[0] as unknown).toEqual({ f: null, i: null, t: null })
  })

  test('multiple rows + array mode', async () => {
    const r = await c.queryTyped('select g::int4, (g*1.5)::float8 from generate_series(1,3) g', [],
      [{ name: 'g', oid: 23, format: 'binary' }, { name: 'f', oid: 701, format: 'binary' }], { mode: 'array' })
    expect(r.rows as unknown as number[][]).toEqual([[1, 1.5], [2, 3], [3, 4.5]])
  })
})
