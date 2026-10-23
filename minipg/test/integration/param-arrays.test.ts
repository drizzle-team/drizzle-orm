// Explicit per-param typing: PG array INPUT across ALL array types. Each case sends a JS array via
// `{ params: ['<type>[]'] }` and asks the server to echo the parsed array's CANONICAL text (`$1::text`),
// compared to the same array built from a SQL literal — so a correct encoding round-trips to identical
// canonical text regardless of how the driver quoted the input. Covers the 9 previously-working array
// types AND the 14 that used to JSON-misencode (numeric[]/uuid[]/date[]/json[]/bytea[]/…).
// Needs a cluster: `bun run test:setup`, or MINIPG_TEST_URL=… for a remote (e.g. Neon).
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect, caught } from '../helpers/db.ts'
import type { Connection } from '../../src/index.ts'
import type { ParamType } from '../../src/spec.ts'

let c: Connection
beforeAll(async () => { c = await testConnect() })
afterAll(async () => { await c?.end() })

// { type, js values, SQL expression building the same array } — assert driver-encoded === SQL-literal.
const CASES: Array<{ type: string; js: unknown[]; ref: string }> = [
  { type: 'int2', js: [1, 2, 3], ref: `'{1,2,3}'::int2[]` },
  { type: 'int4', js: [1, 2, 3], ref: `'{1,2,3}'::int4[]` },
  { type: 'int8', js: [1n, 9223372036854775807n], ref: `'{1,9223372036854775807}'::int8[]` },
  { type: 'oid', js: [1, 2], ref: `'{1,2}'::oid[]` },
  { type: 'float4', js: [1.5, 2.5], ref: `'{1.5,2.5}'::float4[]` },
  { type: 'float8', js: [1.5, -3.5], ref: `'{1.5,-3.5}'::float8[]` },
  { type: 'numeric', js: ['1.50', '10.25', '-0.001'], ref: `'{1.50,10.25,-0.001}'::numeric[]` },
  { type: 'money', js: ['12.34', '0.01'], ref: `'{12.34,0.01}'::money[]` },
  { type: 'bool', js: [true, false], ref: `'{t,f}'::bool[]` },
  { type: 'text', js: ['a,b', 'c"d', 'x\\y', ' sp '], ref: `array['a,b','c"d','x'||chr(92)||'y',' sp ']::text[]` },
  { type: 'varchar', js: ['x', 'y'], ref: `'{x,y}'::varchar[]` },
  { type: 'bpchar', js: ['a', 'b'], ref: `'{a,b}'::bpchar[]` },
  { type: 'name', js: ['n1', 'n2'], ref: `'{n1,n2}'::name[]` },
  { type: 'uuid', js: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'], ref: `'{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}'::uuid[]` },
  { type: 'json', js: [{ a: 1 }, { b: 2 }], ref: `array['{"a":1}','{"b":2}']::json[]` },
  { type: 'jsonb', js: [{ a: 1 }, { b: 2 }], ref: `array['{"a":1}','{"b":2}']::jsonb[]` },
  { type: 'bytea', js: [Buffer.from('deadbeef', 'hex'), Buffer.from('00ff', 'hex')], ref: `array['\\xdeadbeef'::bytea,'\\x00ff']::bytea[]` },
  { type: 'date', js: ['2024-01-15', '1999-12-31'], ref: `'{2024-01-15,1999-12-31}'::date[]` },
  { type: 'time', js: ['10:30:45', '23:59:59'], ref: `'{10:30:45,23:59:59}'::time[]` },
  { type: 'interval', js: ['1 day', '2 hours'], ref: `array['1 day','2 hours']::interval[]` },
  { type: 'timestamp', js: [new Date('2024-01-15T10:30:45Z')], ref: `'{2024-01-15 10:30:45}'::timestamp[]` },
  { type: 'timestamptz', js: [new Date('2024-01-15T10:30:45Z')], ref: `'{2024-01-15 10:30:45+00}'::timestamptz[]` },
]

describe('explicit params:[] — array INPUT round-trips for every element type', () => {
  for (const { type, js, ref } of CASES) {
    test(`${type}[]`, async () => {
      const r = await c.query(`select ($1::text) as got, (${ref})::text as want`, [js], { params: [`${type}[]`] as ParamType[] })
      const [got, want] = r.rows[0] as unknown as [string, string]
      expect(got).toBe(want)
    })
  }
})

describe('array edge cases', () => {
  const both = async (ref: string, js: unknown[], params: string[]) =>
    (await c.query(`select ($1::text) as got, (${ref})::text as want`, [js], { params: params as ParamType[] })).rows[0] as unknown as [string, string]

  test('empty {} (binary ndim=0 path)', async () => { const [g, w] = await both(`'{}'::int4[]`, [[]][0] as unknown[], ['int4[]']); expect(g).toBe(w); expect(g).toBe('{}') })
  test('NULL elements', async () => { const [g, w] = await both(`'{1,NULL,3}'::int4[]`, [1, null, 3], ['int4[]']); expect(g).toBe(w) })
  test('nested / multidimensional', async () => { const [g, w] = await both(`'{{1,2},{3,4}}'::int4[]`, [[1, 2], [3, 4]], ['int4[]']); expect(g).toBe(w) })
  test('empty numeric[] (previously-broken type, empty)', async () => { const [g, w] = await both(`'{}'::numeric[]`, [[]][0] as unknown[], ['numeric[]']); expect(g).toBe(w) })

  test('UNTYPED JS array → PG literal (Option A), server casts', async () => {
    const r = await c.query(`select ($1::int4[])::text as got`, [[1, 2, 3]]) // no params: encodeValueInto → arrayLiteral
    expect((r.rows[0] as unknown[])[0]).toBe('{1,2,3}')
  })

  test('declared json + JS array stays JSON (not a PG array literal)', async () => {
    const r = await c.query(`select ($1::text) as got`, [[1, 2, 3]], { params: ['json'] })
    expect((r.rows[0] as unknown[])[0]).toBe('[1,2,3]') // JSON, not '{1,2,3}'
  })

  test('arity guard: fewer values than declared types rejects locally', async () => {
    const err = await caught(() => c.query('select $1, $2', [1], { params: ['int4', 'int4'] }))
    expect((err as Error).message).toMatch(/1 param value.*2 type.*declared/)
  })
})
