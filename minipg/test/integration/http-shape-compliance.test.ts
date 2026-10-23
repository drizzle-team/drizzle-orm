// minipg/http SHAPE COMPLIANCE vs the wire driver: the same query + the same shape must decode to
// deep-equal rows over both transports. Differential by construction — the http client is fed a
// REAL mode:'wire' capture of the very statement (that capture IS the gateway body), so any
// divergence in the shape grammar, targets, markers, or defaults fails here. This also crosses the
// binary/text seam: the wire driver upgrades boost columns to BINARY per its shape while the
// capture pins TEXT — equal rows prove the value-identity contract shape decode relies on.
import { test, expect, describe } from 'bun:test'
import { client } from '../../src/http.ts'
import { connect, defineType, Json, Jsonb, JsonbArray, Collect, CollectNullable, Nullable, Transform, Shape, type ConnectConfig } from '../../src/index.ts'
import { geometry } from '../../src/geometry.ts'
import { TEST_CONFIG, TEST_TIMEOUT } from '../helpers/db.ts'

const complex = defineType('http_complex', { ascii: true, targets: { obj: (s) => { const i = s.indexOf('+'); return { re: Number(s.slice(0, i)), im: Number(s.slice(i + 1, -1)) } } } })

type AnyOpts = Record<string, unknown>

async function compliant(sql: string, opts: AnyOpts): Promise<void> {
  const wire = await connect(TEST_CONFIG as ConnectConfig)
  try {
    const expected = await (wire as unknown as { query: (s: string, p: unknown[], o: AnyOpts) => Promise<{ rows: unknown[] }> }).query(sql, [], opts)
    const frames = await wire.query(sql, [], { mode: 'wire' })
    const body = Buffer.concat(frames.map((f) => Buffer.from(f)))
    const db = client({
      url: 'https://gw.example/query',
      fetch: (async () => new Response(new Uint8Array(body), { status: 200, headers: { 'Content-Type': 'application/vnd.minipg.pgwire' } })) as unknown as typeof fetch,
    })
    const got = await (db as unknown as { query: (s: string, p: unknown[], o: AnyOpts) => Promise<{ rows: unknown[] }> }).query(sql, [], opts)
    expect(got.rows).toEqual(expected.rows)
  } finally { wire.end() }
}

describe('minipg/http decodes shapes EXACTLY like the wire driver', () => {
  test('scalar TypeSpec targets (int8/numeric/temporal/float4/uuid/bytea/bool/json)', async () => {
    await compliant(
      `select 9007199254740993::int8 as a, 9007199254740993::int8 as b, 9007199254740993::int8 as c,
              '${'1'.repeat(31)}'::numeric as big, 10.50::numeric as n,
              '2024-01-02T03:04:05.678Z'::timestamptz as t1, '2024-01-02T03:04:05.678Z'::timestamptz as t2, '2024-01-02T03:04:05.678Z'::timestamptz as t3,
              0.1::float4 as f, 0.1::float4 as fp,
              'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid as u, '\\xdeadbeef'::bytea as by, true as ok, '{"k":[1,2]}'::jsonb as j`,
      { mode: 'object', shape: {
        a: 'int8', b: 'int8:number', c: 'int8:string', big: 'numeric:bigint', n: 'numeric',
        t1: 'timestamptz', t2: 'timestamptz:ms', t3: 'timestamptz:string',
        f: 'float4', fp: 'float4:precise', u: 'uuid', by: 'bytea', ok: 'bool', j: 'jsonb',
      } })
  }, TEST_TIMEOUT)

  test('array specs with element targets, incl. 2-D', async () => {
    await compliant(
      `select array[1,2,null]::int8[] as a, array['x','y']::text[] as t, array[1.5,2.5]::numeric[] as n,
              array['2024-01-02T03:04:05Z']::timestamptz[] as ts, '{{1,2},{3,4}}'::int4[] as dd`,
      { mode: 'object', shape: { a: 'int8[]:number', t: 'text[]', n: 'numeric[]', ts: 'timestamptz[]:ms', dd: 'int4[]' } })
  }, TEST_TIMEOUT)

  test('Json/Jsonb markers: declared order, jsonb sort order, exact bigints, arrays inside', async () => {
    await compliant(
      `select '{"big":9007199254740993,"when":"2024-01-02T03:04:05","ns":[[1,2],[3,4]]}'::json as j,
              '{"a":1,"bb":9007199254740993}'::jsonb as jb,
              '[{"id":1},{"id":2}]'::jsonb as arr`,
      { mode: 'object', shape: {
        j: Json({ big: 'int8', when: 'timestamp:ms', ns: 'int8[]:number' }),
        jb: Jsonb([['bb', 'int8'], ['a', 'int4']]),
        arr: JsonbArray({ id: 'int4' }),
      } })
  }, TEST_TIMEOUT)

  test('Collect / CollectNullable / Nullable / Transform', async () => {
    await compliant(
      `select 1 as uid, 'ada' as uname, null::int4 as sid, null::text as sname, 'shout' as tr`,
      { mode: 'object', shape: {
        u: Collect({ uid: 'int4', uname: 'text' }),
        s: CollectNullable({ sid: 'int4', sname: Nullable('text') }),
        tr: Transform('text', (s) => (s as string).toUpperCase()),
      } })
  }, TEST_TIMEOUT)

  test("entries form + integer-string column; 'unknown' defers to the live oid", async () => {
    await compliant(`select 7 as "2024", 42::int8 as u, 'plain' as p`, {
      mode: 'object',
      shape: [['2024', 'int4'], ['u', 'unknown'], ['p', 'unknown']],
    })
  }, TEST_TIMEOUT)

  test('registry markers: defineType + minipg/geometry', async () => {
    // registry decode is NAME-driven (sentinel oids) — the real column type is irrelevant, so the
    // EWKB rides as ::text and no PostGIS install is needed (same trick as the query-suite tests)
    await compliant(
      `select '1.5+2i'::text as cx, '0101000020E6100000000000000000F03F0000000000000040'::text as g, '(3.5,4.5)'::point as pt`,
      { mode: 'object', shape: { cx: complex('obj'), g: geometry('xy'), pt: 'point:xy' } })
  }, TEST_TIMEOUT)

  test('Shape() mapper object and array mode', async () => {
    await compliant(`select 5::int8 as a, 'x' as b`, { mode: 'object', shape: Shape({ a: 'int8:number', b: 'text' }) })
    await compliant(`select 6::int8 as a, 'y' as b`, { mode: 'array', shape: { a: 'int8', b: 'text' } })
  }, TEST_TIMEOUT)

  test('no shape at all: default decode parity (incl. raw array literals)', async () => {
    await compliant(`select 9007199254740993::int8 as a, '{1,2}'::int4[] as arr, '2024-01-02T03:04:05Z'::timestamptz as t`, { mode: 'object' })
  }, TEST_TIMEOUT)
})
