// THE BIG DATATYPE MATRIX — every native PG type the driver decodes, boundary values where they
// matter (int8 across the 2^53 fence, float specials, numeric NaN/2^100, BC dates), an ARRAY of
// each aliased type (with a NULL element), and a rich JSON payload of mixed inner types.
// DIFFERENTIAL against both drivers: each SELECT runs through the WIRE driver and through
// minipg/http fed the statement's own mode:'wire' capture; rows must deep-equal — WITHOUT a shape
// (catalog defaults) and WITH one (aliases + targets). Lives in query/ so MINIPG_VARIANT also runs
// the whole matrix under the interpreted engine. A third check pins shape-alias decode ≡ default
// decode for scalar columns (the binary-upgrade value-identity contract).
import { test, expect, describe } from 'bun:test'
import { client } from '../../../src/http.ts'
import { Json, Jsonb, JsonbArray, type ShapeEntries } from '../../../src/index.ts'
import { testConnect, VARIANT, TEST_TIMEOUT } from '../../helpers/db.ts'

interface Case {
  name: string
  /** SQL literals, already cast. */
  values: string[]
  /** minipg TypeSpec alias — enables the shaped pass + the array column. Absent = raw-text type. */
  alias?: string
  /** SQL cast name when it differs from the alias (e.g. "char"). */
  sqlType?: string
  /** extra :target variants, applied to EVERY value (both drivers must agree, lossy or not). */
  targets?: string[]
  /** element target for the array column. */
  arrayTarget?: string
}

const CASES: Case[] = [
  { name: 'bool', values: ['true', 'false'], alias: 'bool' },
  { name: 'i2', values: ['0::int2', '(-32768)::int2', '32767::int2'], alias: 'int2' },
  { name: 'i4', values: ['0::int4', '2147483647::int4', '(-2147483648)::int4'], alias: 'int4' },
  { name: 'i8', values: [
    '0::int8', '9007199254740991::int8', '9007199254740992::int8', '9007199254740993::int8', // the 2^53 fence
    '(-9007199254740993)::int8', '9223372036854775807::int8', '(-9223372036854775808)::int8',
  ], alias: 'int8', targets: [':number', ':string'], arrayTarget: ':number' },
  { name: 'oidv', values: ['0::oid', '4294967295::oid'], alias: 'oid' },
  { name: 'f4', values: ['0.1::float4', '1.5::float4', '(-2.25e10)::float4'], alias: 'float4', targets: [':precise'] },
  { name: 'f8', values: ["0.1::float8", '1e300::float8', '(-2.5e-300)::float8', "'NaN'::float8", "'Infinity'::float8", "'-Infinity'::float8"], alias: 'float8' },
  { name: 'num', values: ["'0'::numeric", "'10.50'::numeric", "'1267650600228229401496703205376'::numeric", "'-0.00012'::numeric", "'NaN'::numeric"], alias: 'numeric', targets: [':number'] },
  { name: 'mny', values: ["'1234.56'::money"], alias: 'money' },
  { name: 'txt', values: ["'café 😀'::text", "e'tab\\tq \\\\s \"dq\"'::text", "''::text"], alias: 'text' },
  { name: 'vch', values: ["'v'::varchar(5)"], alias: 'varchar' },
  { name: 'bpc', values: ["'ab'::char(4)"], alias: 'bpchar' },
  { name: 'chr', values: ['\'x\'::"char"'], alias: 'char', sqlType: '"char"' },
  { name: 'nm', values: ["'a_name'::name"], alias: 'name' },
  { name: 'byt', values: ["'\\xdeadbeef'::bytea", "''::bytea"], alias: 'bytea' },
  { name: 'uid', values: ["'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid"], alias: 'uuid' },
  { name: 'dt', values: ["'2024-01-02'::date", "'0044-03-15 BC'::date"], alias: 'date', targets: [':ms', ':string'] },
  { name: 'tm', values: ["'13:14:15.123456'::time"], alias: 'time' },
  { name: 'ts', values: ["'2024-01-02T03:04:05.678901'::timestamp"], alias: 'timestamp', targets: [':ms', ':string'] },
  { name: 'tsz', values: ["'2024-01-02T03:04:05.678901Z'::timestamptz"], alias: 'timestamptz', targets: [':ms', ':string'], arrayTarget: ':ms' },
  { name: 'ivl', values: ["'1 year 2 mons 3 days 04:05:06.789'::interval"], alias: 'interval' },
  { name: 'js', values: [`'{"a":1,"b":[true,null,"x"]}'::json`], alias: 'json' },
  { name: 'jsb', values: [`'{"a":1,"b":[true,null,"x"]}'::jsonb`], alias: 'jsonb' },
  { name: 'pt', values: ["'(1.5,2.5)'::point"], alias: 'point', targets: [':xy', ':tuple'], arrayTarget: ':xy' },
  { name: 'ln', values: ["'{1,-2,3.5}'::line"], alias: 'line', targets: [':abc'] },
  // raw-text types (no alias): decode as verbatim PG text on every driver
  { name: 'ine', values: ["'192.168.1.7/32'::inet"] },
  { name: 'cid', values: ["'10.1.0.0/16'::cidr"] },
  { name: 'mac', values: ["'08:00:2b:01:02:03'::macaddr"] },
  { name: 'bit', values: ["B'1010'::bit(4)", "B'10'::varbit"] },
  { name: 'rng', values: ["'[3,7)'::int4range", "'[1.5,2.5]'::numrange", "'(,)'::tstzrange"] },
  { name: 'xml', values: ["'<a>x</a>'::xml"] },
]

const sqlTypeOf = (c: Case): string => c.sqlType ?? c.alias!

// column plan: every value, every target variant, and one NULL-bearing array per aliased type
function build(): { sql: string; shape: ShapeEntries; scalarAliasCols: string[] } {
  const cols: string[] = []
  const shape: [string, string][] = []
  const scalarAliasCols: string[] = []
  for (const c of CASES) {
    c.values.forEach((v, j) => {
      const col = `${c.name}_${j}`
      cols.push(`${v} as ${col}`)
      if (c.alias) { shape.push([col, c.alias]); scalarAliasCols.push(col) }
      else shape.push([col, 'unknown'])
      for (const t of c.targets ?? []) {
        const tcol = `${col}${t.replace(':', '_')}`
        cols.push(`${v} as ${tcol}`)
        shape.push([tcol, `${c.alias}${t}`])
      }
    })
    if (c.alias) {
      const arr = `${c.name}_arr`
      cols.push(`array[${c.values.join(', ')}, null]::${sqlTypeOf(c)}[] as ${arr}`)
      shape.push([arr, `${c.alias}[]${c.arrayTarget ?? ''}`])
    }
  }
  return { sql: 'select ' + cols.join(', '), shape: shape as ShapeEntries, scalarAliasCols }
}

async function differential(sql: string, opts: Record<string, unknown>): Promise<Record<string, unknown>> {
  const wire = await testConnect()
  try {
    const q = wire as unknown as { query: (s: string, p: unknown[], o: Record<string, unknown>) => Promise<{ rows: unknown[]; columns: string[] }> }
    const expected = await q.query(sql, [], { mode: 'object', ...opts })
    const frames = await wire.query(sql, [], { mode: 'wire' })
    const body = Buffer.concat(frames.map((f) => Buffer.from(f)))
    const db = client({
      url: 'https://gw.example/query', decode: VARIANT,
      fetch: (async () => new Response(new Uint8Array(body), { status: 200, headers: { 'Content-Type': 'application/vnd.minipg.pgwire' } })) as unknown as typeof fetch,
    })
    const got = await (db as unknown as { query: (s: string, p: unknown[], o: Record<string, unknown>) => Promise<{ rows: unknown[]; columns: string[] }> }).query(sql, [], { mode: 'object', ...opts })
    expect(got.columns).toEqual(expected.columns)
    expect(got.rows).toEqual(expected.rows)
    return expected.rows[0] as Record<string, unknown>
  } finally { wire.end() }
}

describe(`the big datatype matrix (engine: ${VARIANT})`, () => {
  test('every type × boundary values × arrays — wire ≡ http, without AND with shape; alias-shape ≡ defaults for scalars', async () => {
    const { sql, shape, scalarAliasCols } = build()
    const unshaped = await differential(sql, {})
    const shaped = await differential(sql, { shape })
    // identity-alias shaping must not CHANGE a scalar's decoded value (binary upgrades included)
    for (const col of scalarAliasCols) expect({ col, v: shaped[col] }).toEqual({ col, v: unshaped[col] })
  }, TEST_TIMEOUT)

  test('json/jsonb payload of mixed inner types — unshaped (JSON.parse parity) and shaped (scanner/targets)', async () => {
    const payload = `{"i":1,"big":9007199254740993,"neg":-2,"num":10.5,"b":true,"z":null,"s":"café 😀",` +
      `"ts":"2024-01-02T03:04:05","arr8":[1,9007199254740993],"arr2d":[[1,2],[3,4]],"txt":["a","b"],` +
      `"nested":{"k":9007199254740993},"objs":[{"id":1},{"id":2}]}`
    const sql = `select '${payload}'::json as j, '${payload}'::jsonb as jb`
    await differential(sql, {})
    await differential(sql, {
      shape: {
        j: Json({ i: 'int4', big: 'int8', neg: 'int2', num: 'numeric', b: 'bool', z: 'unknown', s: 'text', ts: 'timestamp:ms', arr8: 'int8[]', arr2d: 'int8[]:number', txt: 'text[]', nested: Json({ k: 'int8' }), objs: JsonbArray({ id: 'int4' }) }),
        jb: Jsonb({ i: 'int4', big: 'int8', neg: 'int2', num: 'numeric', b: 'bool', z: 'unknown', s: 'text', ts: 'timestamp:date', arr8: 'int8[]:string', arr2d: 'int8[]:number', txt: 'text[]', nested: Jsonb({ k: 'int8:number' }), objs: JsonbArray({ id: 'int4' }) }),
      },
    })
  }, TEST_TIMEOUT)
})
