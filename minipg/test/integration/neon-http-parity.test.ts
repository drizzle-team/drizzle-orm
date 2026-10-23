// minipg/neon-http DECODE PARITY — proves the HTTP driver decodes every type identically to the wire
// driver, by running each query through BOTH transports against the SAME Neon backend and asserting the
// decoded rows match. The wire driver (minipg/node over TCP+TLS) is the oracle. All queries are stateless
// single statements (no temp tables — HTTP has no cross-request session); enum/composite/domain use
// catalog DDL, which DOES persist over HTTP.
//
//   NEON_HTTP_URL='postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require' bun run test:neon-http
// Skips when unset.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { connect as httpConnect } from '../../src/neon-http.ts'
import type { NeonHttpClient } from '../../src/neon-http.ts'
import { connect as wireConnect } from '../../src/index.ts' // node net/tls transport (direct TCP to Neon)
import type { Connection } from '../../src/index.ts'

const URL = process.env.NEON_HTTP_URL
const d = describe.skipIf(!URL)

// The type matrix — one row per PG type family. Values are single-execution selects, so BOTH transports
// text-decode them; the assertion is that http and wire produce identical rows.
const MATRIX: Array<{ name: string; sql: string }> = [
  { name: 'integers (int2/int4/int8/oid)', sql: 'select 32767::int2 a, 2147483647::int4 b, 9223372036854775807::int8 c, 26::oid d' },
  { name: 'floats (float4/float8)', sql: 'select 3.14::float4 a, 2.718281828459045::float8 b, (\'Infinity\')::float8 c, (\'NaN\')::float8 dd' },
  { name: 'numeric / money', sql: 'select 12345.6789::numeric a, 99.99::numeric(10,2) b, 0.1::numeric c, 12.34::money m' },
  { name: 'bool', sql: 'select true a, false b, null::bool c' },
  { name: 'text family + unicode', sql: "select 'hello'::text a, 'v'::varchar b, 'abc'::char(5) c, 'nm'::name d, 'café ☕ 日本語 😀'::text e" },
  { name: 'bytea', sql: "select '\\xdeadbeef'::bytea a, ''::bytea b" },
  { name: 'uuid', sql: "select 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid a" },
  { name: 'json / jsonb', sql: `select '{"a":1,"b":[2,3]}'::json a, '{"x":true,"y":null}'::jsonb b, '[1,2,3]'::jsonb c` },
  { name: 'temporal (date/timestamp/tz/time/timetz/interval)', sql: "select '2024-01-15'::date a, '2024-01-15 10:30:45.123456'::timestamp b, '2024-01-15 10:30:45.123456+02'::timestamptz c, '10:30:45'::time d, '10:30:45+02'::timetz e, '3 mons 4 days 05:06:07'::interval f" },
  { name: 'arrays (int4[]/text[])', sql: "select '{1,2,3}'::int4[] a, '{a,b,c}'::text[] b, '{}'::int4[] c" },
  { name: 'network (inet/cidr/macaddr)', sql: "select '192.168.1.1'::inet a, '10.0.0.0/8'::cidr b, '08:00:2b:01:02:03'::macaddr c" },
  { name: 'bit / varbit', sql: "select B'101'::bit(3) a, B'1011'::varbit b" },
  { name: 'ranges (int4range/numrange/tsrange)', sql: "select '[1,5)'::int4range a, '[1.5,3.5]'::numrange b, '[2024-01-01,2024-02-01)'::tsrange c" },
  { name: 'nulls across types', sql: 'select null::int4 a, null::text b, null::timestamptz c, null::jsonb d, null::uuid e' },
  { name: 'enum', sql: "select 'happy'::parity_mood a" },
  { name: 'composite / record', sql: 'select row(1,2)::parity_pt a' },
  { name: 'domain over int4', sql: 'select 5::parity_posint a' },
  { name: 'mixed row (bench-shaped)', sql: "select 1 i4, (9223372036854775807)::int8 i8, 1.5::float8 f8, 10.50::numeric num, '2024-06-01 12:00:00+00'::timestamptz ts, true flag, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid id, 'txt'::text t, json_build_object('n',5)::jsonb j" },
]

d('minipg/neon-http decode parity vs the wire driver (same Neon backend)', () => {
  let http: NeonHttpClient
  let wire: Connection

  beforeAll(async () => {
    http = await httpConnect(URL!)
    wire = await wireConnect(URL!)
    // catalog types (persist over HTTP, unlike temp tables) — idempotent
    await http.query('drop type if exists parity_mood cascade')
    await http.query("create type parity_mood as enum ('sad','ok','happy')")
    await http.query('drop type if exists parity_pt cascade')
    await http.query('create type parity_pt as (x int, y int)')
    await http.query('drop domain if exists parity_posint cascade')
    await http.query('create domain parity_posint as int4 check (value > 0)')
  })
  afterAll(async () => {
    await http?.query('drop type if exists parity_mood cascade').catch(() => {})
    await http?.query('drop type if exists parity_pt cascade').catch(() => {})
    await http?.query('drop domain if exists parity_posint cascade').catch(() => {})
    await http?.end()
    await wire?.end()
  })

  for (const q of MATRIX) {
    test(`object mode: ${q.name}`, async () => {
      const [h, w] = await Promise.all([http.query(q.sql, [], { mode: 'object' }), wire.query(q.sql, [], { mode: 'object' })])
      expect(h.columns).toEqual(w.columns)
      expect(h.rows).toEqual(w.rows) // BigInt/Date/Buffer compared structurally
    })
  }

  test('array mode parity (positional decode)', async () => {
    const sql = MATRIX[0]!.sql
    const [h, w] = await Promise.all([http.query(sql), wire.query(sql)]) // default array mode
    expect(h.rows).toEqual(w.rows)
  })

  test('buffer mode parity (raw text cells)', async () => {
    const sql = "select 42::int4 a, 'hi'::text b, null::int4 c"
    const [h, w] = await Promise.all([http.query(sql, [], { mode: 'buffer' }), wire.query(sql, [], { mode: 'buffer' })])
    expect(h.rows).toEqual(w.rows)
  })

  test('parameterized decode parity ($1/$2 round-trip)', async () => {
    const sql = 'select $1::int8 a, $2::numeric b, $3::text c, $4::bool d'
    const params = ['9007199254740993', '3.14159', 'café', true]
    const [h, w] = await Promise.all([http.query(sql, params, { mode: 'object' }), wire.query(sql, params, { mode: 'object' })])
    expect(h.rows).toEqual(w.rows)
  })
})

// Config + shape machinery flows through the HTTP client the same as the wire driver.
d('minipg/neon-http config & shape decode', () => {
  test('jsonBigints:"bigint" preserves oversized ints inside jsonb', async () => {
    const db = await httpConnect({ url: URL!, jsonBigints: 'bigint' })
    try {
      const r = await db.query(`select '{"n": 9007199254740993}'::jsonb as j`, [], { mode: 'object' })
      expect((r.rows[0] as { j: { n: bigint } }).j.n).toBe(9007199254740993n)
    } finally { await db.end() }
  })

  test('temporal:"string" returns exact PG text (lossless µs)', async () => {
    const db = await httpConnect({ url: URL!, temporal: 'string' })
    try {
      const r = await db.query(`select '2024-01-15 10:30:45.123456+00'::timestamptz as ts`, [], { mode: 'object' })
      expect((r.rows[0] as { ts: string }).ts).toContain('2024-01-15 10:30:45.123456')
    } finally { await db.end() }
  })

  test('types override applies to the parsed decode', async () => {
    const db = await httpConnect({ url: URL!, types: { 23: (b) => 'INT4:' + b.toString('utf8') } })
    try {
      const r = await db.query('select 7::int4 as x', [], { mode: 'object' })
      expect((r.rows[0] as { x: string }).x).toBe('INT4:7')
    } finally { await db.end() }
  })

  test('shape js-target override (int8:number) decodes via the same mapper', async () => {
    const db = await httpConnect(URL!)
    try {
      const r = await db.query('select 5::int8 as v', [], { shape: { v: 'int8:number' } })
      expect((r.rows[0] as { v: number }).v).toBe(5)
      expect(typeof (r.rows[0] as { v: number }).v).toBe('number')
    } finally { await db.end() }
  })
})
