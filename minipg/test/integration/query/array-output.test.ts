// OUTPUT array decode: shape: { v: 'int4[]' } decodes a '{…}' result column to a JS array. Runs each case
// through BOTH mappers (decode:'jit' and decode:'interpreted') and asserts they agree, then against minipg's
// precision semantics (int8[]->BigInt, numeric[]->exact STRING, timestamptz[]->Date, bytea[]->Buffer). The
// SQL executes on real Postgres, so this is a live round-trip. Needs a cluster (test:setup) or MINIPG_TEST_URL.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect } from '../../helpers/db.ts'
import type { Connection } from '../../../src/index.ts'
import type { TypeSpec } from '../../../src/spec.ts'

let jit: Connection, interp: Connection
beforeAll(async () => { jit = await testConnect({ decode: 'jit' }); interp = await testConnect({ decode: 'interpreted' }) })
afterAll(async () => { await jit?.end(); await interp?.end() })

const eq = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (typeof a === 'bigint' || typeof b === 'bigint') return typeof a === typeof b && a === b
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) return a.equals(b)
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') { // plain objects (json[] elements)
    const ka = Object.keys(a as object), kb = Object.keys(b as object)
    return ka.length === kb.length && ka.every((k) => eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

/** Decode `sql`'s column v under both mappers; assert jit === interp; return the value. */
async function decode(sql: string, shape: TypeSpec): Promise<unknown> {
  const j = (await jit.query(sql, [], { shape: { v: shape } })).rows[0] as { v: unknown }
  const i = (await interp.query(sql, [], { shape: { v: shape } })).rows[0] as { v: unknown }
  expect(eq(j.v, i.v)).toBe(true) // dual-variant: jit and interpreted decode identically
  return j.v
}

const CASES: Array<{ name: string; sql: string; shape: TypeSpec; want: unknown }> = [
  { name: 'int4[]', sql: `select '{1,2,3}'::int4[] v`, shape: 'int4[]', want: [1, 2, 3] },
  { name: 'int2[]', sql: `select '{10,20}'::int2[] v`, shape: 'int2[]', want: [10, 20] },
  { name: 'int8[] -> BigInt (default)', sql: `select '{9223372036854775807,1}'::int8[] v`, shape: 'int8[]', want: [9223372036854775807n, 1n] },
  { name: 'int8[]:number', sql: `select '{100,200}'::int8[] v`, shape: 'int8[]:number', want: [100, 200] },
  { name: 'float8[]', sql: `select '{1.5,-3.5,0}'::float8[] v`, shape: 'float8[]', want: [1.5, -3.5, 0] },
  { name: 'numeric[] -> exact STRING (default)', sql: `select '{1.5,10.50,-0.001}'::numeric[] v`, shape: 'numeric[]', want: ['1.5', '10.50', '-0.001'] },
  { name: 'numeric[]:number', sql: `select '{1.5,10.50}'::numeric[] v`, shape: 'numeric[]:number', want: [1.5, 10.5] },
  { name: 'bool[]', sql: `select '{t,f,t}'::bool[] v`, shape: 'bool[]', want: [true, false, true] },
  { name: 'text[] simple', sql: `select '{a,b,c}'::text[] v`, shape: 'text[]', want: ['a', 'b', 'c'] },
  { name: 'text[] quoting/comma/quote/backslash/empty/NULL-word/spaces', sql: `select array['a,b','c"d','x'||chr(92)||'y','','NULL',' sp ']::text[] v`, shape: 'text[]', want: ['a,b', 'c"d', 'x\\y', '', 'NULL', ' sp '] },
  { name: 'text[] with real null', sql: `select array['x',null,'z']::text[] v`, shape: 'text[]', want: ['x', null, 'z'] },
  { name: 'text[] unicode', sql: `select array['café','日本語','😀']::text[] v`, shape: 'text[]', want: ['café', '日本語', '😀'] },
  { name: 'uuid[]', sql: `select '{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}'::uuid[] v`, shape: 'uuid[]', want: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'] },
  { name: 'bytea[] -> Buffer', sql: `select array['\\xdeadbeef'::bytea,'\\x00ff'] v`, shape: 'bytea[]', want: [Buffer.from('deadbeef', 'hex'), Buffer.from('00ff', 'hex')] },
  { name: 'date[] -> Date (default)', sql: `select '{2024-01-15,1999-12-31}'::date[] v`, shape: 'date[]', want: [new Date('2024-01-15T00:00:00Z'), new Date('1999-12-31T00:00:00Z')] },
  { name: 'timestamptz[] -> Date (default)', sql: `select array['2024-01-15 10:30:45+00'::timestamptz,'2020-06-01 00:00:00+00'] v`, shape: 'timestamptz[]', want: [new Date('2024-01-15T10:30:45Z'), new Date('2020-06-01T00:00:00Z')] },
  { name: 'json[] -> JSON.parse', sql: `select array['{"a":1}','[2,3]']::json[] v`, shape: 'json[]', want: [{ a: 1 }, [2, 3]] },
  { name: 'jsonb[] -> JSON.parse', sql: `select array['{"a":1}','[2,3]']::jsonb[] v`, shape: 'jsonb[]', want: [{ a: 1 }, [2, 3]] },
  // structure
  { name: 'empty {} -> []', sql: `select '{}'::int4[] v`, shape: 'int4[]', want: [] },
  { name: 'NULL element', sql: `select '{1,NULL,3}'::int4[] v`, shape: 'int4[]', want: [1, null, 3] },
  { name: 'nested {{1,2},{3,4}}', sql: `select '{{1,2},{3,4}}'::int4[] v`, shape: 'int4[]', want: [[1, 2], [3, 4]] },
  { name: 'custom bounds [2:4]={10,20,30}', sql: `select '[2:4]={10,20,30}'::int4[] v`, shape: 'int4[]', want: [10, 20, 30] },
]

describe('OUTPUT array decode — dual-variant (jit == interpreted) + precision semantics', () => {
  for (const c of CASES) {
    test(c.name, async () => {
      const got = await decode(c.sql, c.shape)
      if (c.name.startsWith('int8[] -> BigInt')) expect((got as bigint[]).every((x) => typeof x === 'bigint')).toBe(true) // BigInt, not lossy number
      if (c.name.startsWith('numeric[] -> exact')) expect(got).toEqual(['1.5', '10.50', '-0.001']) // exact strings, not floats (pg loses this)
      expect(eq(got, c.want)).toBe(true)
    })
  }

  test('timestamptz[]:string keeps the raw PG element text (both variants agree)', async () => {
    const got = await decode(`select array['2024-01-15 10:30:45+00'::timestamptz] v`, 'timestamptz[]:string')
    expect(Array.isArray(got) && typeof (got as string[])[0] === 'string').toBe(true)
  })

  test('DEFAULT (no shape): a built-in array OID decodes identically to the declared shape', async () => {
    const shaped = await decode(`select '{1,2,3}'::int4[] v`, 'int4[]')
    const j = (await jit.query(`select '{1,2,3}'::int4[] v`, [], { mode: 'object' })).rows[0] as { v: unknown }
    const i = (await interp.query(`select '{1,2,3}'::int4[] v`, [], { mode: 'object' })).rows[0] as { v: unknown }
    expect(eq(j.v, [1, 2, 3])).toBe(true)
    expect(eq(i.v, [1, 2, 3])).toBe(true)
    expect(eq(j.v, shaped)).toBe(true) // shaped and unshaped agree — same decoder, bound off the wire OID
  })
})

// A shaped temporal SCALAR auto-upgrades to binary and decodes BC/±infinity correctly; array elements are
// text-only, so parseInstantMs must reproduce the binary result for these out-of-normal-range values.
describe('OUTPUT array decode — BC-era + ±infinity temporals match the binary scalar', () => {
  const PAIRS: Array<[string, TypeSpec, TypeSpec]> = [
    [`select array['0044-03-15 12:00:00+00 BC'::timestamptz] a, '0044-03-15 12:00:00+00 BC'::timestamptz s`, 'timestamptz[]', 'timestamptz'],
    [`select array['0044-03-15 BC'::date] a, '0044-03-15 BC'::date s`, 'date[]', 'date'],
    [`select array['0001-01-01 BC'::date] a, '0001-01-01 BC'::date s`, 'date[]', 'date'],
    [`select array['0100-06-15 BC'::date] a, '0100-06-15 BC'::date s`, 'date[]', 'date'],
    [`select array['infinity'::timestamptz] a, 'infinity'::timestamptz s`, 'timestamptz[]', 'timestamptz'],
    [`select array['-infinity'::timestamptz] a, '-infinity'::timestamptz s`, 'timestamptz[]', 'timestamptz'],
  ]
  for (const [sql, sh, ss] of PAIRS) {
    test(sql.slice(7, 52), async () => {
      for (const c of [jit, interp]) {
        const r = (await c.query(sql, [], { shape: { a: sh, s: ss } })).rows[0] as { a: Date[]; s: Date }
        const at = r.a[0]!.getTime(), st = r.s.getTime()
        expect(Number.isNaN(at) ? Number.isNaN(st) : at === st).toBe(true) // array element == binary scalar (both variants)
      }
    })
  }
})
