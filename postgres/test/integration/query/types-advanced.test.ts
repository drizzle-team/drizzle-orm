// Domain: types-advanced — arrays, ranges, enums, composite/record, domains,
// network (inet/cidr/macaddr/macaddr8), geometric, hstore, tsvector/xml/pg_lsn/
// bit, "char", plus the all-common-types round-trip matrix.
//
// Grounded in src/encode.ts: defaultDecoders only registers
// bool/bytea/int2/int4/oid/float4/float8/json/jsonb; decoderFor falls back to
// asString for everything else. So ranges/composites/enums/network/geometric/
// hstore all decode to the raw PG text literal STRING today. The exception is
// BUILT-IN ARRAY types: tagArrayCol binds the array decoder to those wire OIDs,
// so int4[]/text[]/jsonb[]/... come back as JS arrays with no shape declared —
// arrays of PER-DATABASE element types (enum[], domain[], composite[]) still
// don't, since the wire OID alone can't identify the element. These tests
// assert that baseline and mark roadmap rich-decoder features as test.todo.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect, caught, PgError } from '../../helpers/db.ts'
import { buildDecoders, defaultDecoders } from '../../../src/decode.ts'
import { decoderFor } from '../../../src/decode.ts'
import type { Connection } from '../../../src/index.ts'

// One shared connection that owns the pg_temp enum/composite/domain types.
// pg_temp objects are connection-scoped and auto-dropped on disconnect, so we
// never mutate shared/global schema.
let c: Connection
let hstoreOk = false

// Helpers for strict, noUncheckedIndexedAccess-safe cell access.
const cell0 = (r: { rows: unknown[] }): unknown => (r.rows[0] as unknown[])[0]
const cellN = (r: { rows: unknown[] }, i: number): unknown => (r.rows[0] as unknown[])[i]

beforeAll(async () => {
  c = await testConnect()
  await c.query("create type pg_temp.mood as enum('sad','ok','happy')")
  await c.query('create type pg_temp.cplx as (r float8, i float8)')
  await c.query('create domain pg_temp.posint as integer check(value>0)')
  await c.query('create domain pg_temp.email as text')
  await c.query('create domain pg_temp.mydom as text')
  try {
    await c.query('create extension if not exists hstore')
    hstoreOk = true
  } catch {
    hstoreOk = false
  }
})

afterAll(async () => {
  if (c) await c.end()
})

// ---------------------------------------------------------------------------
// A PLAIN (unshaped) query binds the array decoder off the wire array OID (tagArrayCol), so built-in
// array columns arrive as JS arrays with the same element semantics a declared shape gives. Full
// element-precision + grammar coverage lives in array-output.test.ts (dual-variant); this block is the
// no-shape contract.
describe('array decode — built-in array OIDs decode to JS arrays with no shape', () => {
  test("int4[] '{1,2,3}' decodes to a JS array, not the raw literal", async () => {
    const r = await c.query("select '{1,2,3}'::int4[] as a")
    expect(cell0(r)).toEqual([1, 2, 3])
    expect(Array.isArray(cell0(r))).toBe(true)
  })

  test('float8[] elements parse to numbers', async () => {
    const r = await c.query("select '{1.5,2.25}'::float8[] as a")
    expect(cell0(r)).toEqual([1.5, 2.25])
  })

  test('text[] with an embedded comma: PG quoting is unwrapped, not surfaced', async () => {
    const r = await c.query("select array['a,b','c']::text[] as a")
    expect(cell0(r)).toEqual(['a,b', 'c'])
  })

  test('int2[] bare NULL token -> a real null element', async () => {
    const r = await c.query("select '{1,NULL,3}'::int2[] as a")
    expect(cell0(r)).toEqual([1, null, 3])
  })

  test('empty arrays decode to [], never null/undefined', async () => {
    const r1 = await c.query('select array[]::text[] as a')
    const r2 = await c.query("select '{}'::int4[] as a")
    expect(cell0(r1)).toEqual([])
    expect(cell0(r2)).toEqual([])
  })

  test('element precision follows the scalar defaults: int8[] -> BigInt, numeric[] -> exact string', async () => {
    expect(cell0(await c.query("select '{9223372036854775807,1}'::int8[] as a"))).toEqual([9223372036854775807n, 1n])
    expect(cell0(await c.query("select '{1.50,2.00}'::numeric[] as a"))).toEqual(['1.50', '2.00'])
  })

  test('a config.types entry for the array OID still overrides the built-in parser', async () => {
    const o = await testConnect({ types: { 1007: (b: Buffer) => 'RAW:' + b.toString('utf8') } })
    try { expect(cell0(await o.query("select '{1,2,3}'::int4[] as a"))).toBe('RAW:{1,2,3}') } finally { await o.end() }
  })

  test('element types with per-database OIDs (enum[]) are NOT recognised from the wire OID — still text', async () => {
    expect(cell0(await c.query("select '{happy,sad}'::pg_temp.mood[] as a"))).toBe('{happy,sad}')
  })
})

// These assert the ENCODE direction (JS array -> PG array literal param). The server echoes an array
// column back, which now DECODES to a JS array, so each round-trip lands on the input value.
describe('array encode — JS array -> PG array literal (Option A / declared params)', () => {
  test("JS ['a','b','c'] -> text[] '{a,b,c}' round-trips", async () => {
    expect(cell0(await c.query('select $1::text[] as a', [['a', 'b', 'c']]))).toEqual(['a', 'b', 'c'])
    expect(cell0(await c.query('select ($1::text[])::text as a', [['a', 'b', 'c']]))).toBe('{a,b,c}') // the literal actually sent
  })

  test('escape hatch still works: a PG array literal STRING casts', async () => {
    expect(cell0(await c.query('select $1::int4[] as a', ['{1,2,3}']))).toEqual([1, 2, 3])
  })

  test('array of bigints -> int8[] (arrayLiteral handles BigInt, no throw)', async () => {
    expect(cell0(await c.query('select $1::int8[] as a', [[1n, 9223372036854775807n]]))).toEqual([1n, 9223372036854775807n])
  })

  test("null elements & empty: ['A',null,'B'] -> {A,NULL,B}; [] -> {}", async () => {
    expect(cell0(await c.query('select $1::text[] as a', [['A', null, 'B']]))).toEqual(['A', null, 'B'])
    expect(cell0(await c.query('select ($1::text[])::text as a', [['A', null, 'B']]))).toBe('{A,NULL,B}') // bare NULL token, not the string "NULL"
    expect(cell0(await c.query('select $1::int4[] as a', [[]]))).toEqual([])
  })

  test("nested [['a'],['b']] -> {{a},{b}}", async () => {
    expect(cell0(await c.query('select $1::text[] as a', [[['a'], ['b']]]))).toEqual([['a'], ['b']])
    expect(cell0(await c.query('select ($1::text[])::text as a', [[['a'], ['b']]]))).toBe('{{a},{b}}')
  })

  test('= ANY($1::int4[]) membership with a JS array param', async () => {
    expect(cell0(await c.query('select 2 = any($1::int4[]) as a', [[1, 2, 3]]))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('range & multirange', () => {
  test("int4range '[1,10)' decodes to the literal string", async () => {
    const r = await c.query("select '[1,10)'::int4range as a")
    expect(cell0(r)).toBe('[1,10)')
  })

  test('range bounds/inclusivity asserted server-side via lower()/upper()', async () => {
    const r = await c.query(
      "select lower('[1,10)'::int4range), upper('[1,10)'::int4range), lower_inc('[1,10)'::int4range), upper_inc('[1,10)'::int4range)",
    )
    expect(cellN(r, 0)).toBe(1)
    expect(cellN(r, 1)).toBe(10)
    expect(cellN(r, 2)).toBe(true)
    expect(cellN(r, 3)).toBe(false)
  })

  test('empty and unbounded ranges round-trip as their literal strings', async () => {
    const r1 = await c.query("select 'empty'::tsrange as a")
    const r2 = await c.query("select '[2020-01-01,)'::tsrange as a")
    expect(cell0(r1)).toBe('empty')
    expect(typeof cell0(r2)).toBe('string')
    expect(cell0(r2) as string).toContain('2020-01-01')
  })

  test('daterange @> $1::date returns boolean (no 22P02 malformed range)', async () => {
    const inside = await c.query("select daterange('2020-01-01','2020-12-31') @> $1::date as x", ['2020-06-01'])
    const lo = await c.query("select daterange('2020-01-01','2020-12-31') @> $1::date as x", ['2020-01-01'])
    const hi = await c.query("select daterange('2020-01-01','2020-12-31') @> $1::date as x", ['2020-12-31'])
    expect(cell0(inside)).toBe(true)
    expect(cell0(lo)).toBe(true)
    expect(cell0(hi)).toBe(false) // upper bound exclusive
  })

  test('tstzrange @> $1::timestamptz with a Date param resolves to boolean', async () => {
    // encodeParam(Date) -> ISO text; explicit ::timestamptz cast disambiguates.
    const r = await c.query("select '[2020-01-01,2021-01-01)'::tstzrange @> $1::timestamptz as x", [
      new Date('2020-06-01T00:00:00Z'),
    ])
    expect(cell0(r)).toBe(true)
  })

  test('explicit param cast $1::timestamptz lets the user disambiguate', async () => {
    const r = await c.query('select $1::timestamptz = $1::timestamptz as x', [new Date('2020-06-01T00:00:00Z')])
    expect(cell0(r)).toBe(true)
  })

  test.todo("registered int4range decoder -> {lower,upper,lowerInc,upperInc}", () => {})
  test.todo('int4multirange decoder -> array of ranges (PG14+)', () => {})
})

// ---------------------------------------------------------------------------
describe('enum', () => {
  test("scalar enum 'happy'::mood round-trips to the exact JS string", async () => {
    const r = await c.query("select 'happy'::pg_temp.mood as m")
    expect(cell0(r)).toBe('happy')
  })

  test('unknown enum OID falls back to text decode, no throw', async () => {
    const r = await c.query("select 'sad'::pg_temp.mood as m")
    expect(cell0(r)).toBe('sad')
  })

  test('enum param sent as text round-trips through a cast', async () => {
    const r = await c.query('select $1::pg_temp.mood as m', ['ok'])
    expect(cell0(r)).toBe('ok')
  })

  test('mood[] working path: bind a PG array literal STRING -> raw string back', async () => {
    const r = await c.query('select $1::pg_temp.mood[] as a', ['{happy,sad}'])
    expect(cell0(r)).toBe('{happy,sad}')
  })

  test.todo("array encode + enum-array decode: ['happy','sad'] round-trips", () => {})
  test.todo('enum labels needing quoting round-trip through mood[]', () => {})
  test.todo("server-built ARRAY['ok','happy']::mood[] -> ['ok','happy']", () => {})
})

// ---------------------------------------------------------------------------
describe('composite / record', () => {
  test('ROW(1,2)::cplx decodes to the raw literal string, not an object', async () => {
    const r = await c.query('select ROW(1,2)::pg_temp.cplx as c')
    expect(cell0(r)).toBe('(1,2)')
  })

  test('row-expression yields ONE record column, vs two scalar columns', async () => {
    const one = await c.query('select (a.x, a.y) from (select 1 x, 2 y) a')
    const two = await c.query('select a.x, a.y from (select 1 x, 2 y) a')
    expect(one.columns.length).toBe(1)
    expect(cell0(one)).toBe('(1,2)')
    expect(two.columns.length).toBe(2)
    expect(cellN(two, 0)).toBe(1)
    expect(cellN(two, 1)).toBe(2)
  })

  test('JS object bound to a composite fails (JSON, not a record literal)', async () => {
    const err = await caught(() => c.query('select $1::pg_temp.cplx as c', [{ r: 1, i: 2 }]))
    expect((err as PgError).code).toBe('22P02')
  })

  test('composite working path: bind a (..) record literal STRING and cast', async () => {
    const r = await c.query('select $1::pg_temp.cplx as c', ['(1,2)'])
    expect(cell0(r)).toBe('(1,2)')
  })

  test.todo("record grammar: ('a,b','he said \"\"hi\"\"',,42) -> ['a,b','he said \"hi\"',null,'42']", () => {})
  test.todo('registered composite decoder -> {r:1,i:2} with typed fields', () => {})
  test.todo('composite encode: {r,i} or [r,i] -> (1,2)', () => {})
  test.todo('array_agg(t)::complex[] -> array of structured objects', () => {})
})

// ---------------------------------------------------------------------------
describe('domain', () => {
  test('posint reports base OID int4 -> decodes to a JS number', async () => {
    const r = await c.query('select 5::pg_temp.posint as id')
    expect(cell0(r)).toBe(5)
    expect(typeof cell0(r)).toBe('number')
  })

  test('email domain over text decodes via base text decoder', async () => {
    const r = await c.query("select 'a@b.com'::pg_temp.email as e")
    expect(cell0(r)).toBe('a@b.com')
  })

  test('CHECK violation surfaces as PgError 23514 and connection recovers', async () => {
    const err = await caught(() => c.query('select (-1)::pg_temp.posint as id'))
    expect((err as PgError).code).toBe('23514')
    const ok = await c.query('select 1 as x') // still usable
    expect(cell0(ok)).toBe(1)
  })

  test('a parser keyed on the BASE OID (text/25) fires for a domain-over-text column', async () => {
    // server reports the base OID (25) for mydom, so a text-OID parser fires;
    // a parser keyed on the domain's own OID would NOT (corrected semantics).
    const c2 = await testConnect({ types: { 25: (b) => `wrapped:${b.toString('utf8')}` } })
    try {
      await c2.query('create domain pg_temp.mydom as text')
      const r = await c2.query("select 'hi'::pg_temp.mydom as d")
      expect(cell0(r)).toBe('wrapped:hi')
    } finally {
      await c2.end()
    }
  })

  test.todo('encode domain-over-array: JS array serializes to {a,b,c} (roadmap)', () => {})
  test.todo('domain-over-domain resolves transitively to base integer', () => {})
})

// ---------------------------------------------------------------------------
describe('network types — inet / cidr / macaddr / macaddr8 (MISSING family)', () => {
  test('inet/cidr/macaddr/macaddr8 decode to their raw text strings', async () => {
    const r = await c.query(
      "select '192.168.0.1'::inet, '10.0.0.0/8'::cidr, '08:00:2b:01:02:03'::macaddr, '08:00:2b:01:02:03:04:05'::macaddr8",
    )
    expect(cellN(r, 0)).toBe('192.168.0.1')
    expect(cellN(r, 1)).toBe('10.0.0.0/8')
    expect(cellN(r, 2)).toBe('08:00:2b:01:02:03')
    expect(cellN(r, 3)).toBe('08:00:2b:01:02:03:04:05')
  })

  test('inet round-trip via string param + host()', async () => {
    const r = await c.query('select host($1::inet) as h', ['192.168.0.1'])
    expect(cell0(r)).toBe('192.168.0.1')
  })

  test('IPv6 and netmask suffix preserved in inet text', async () => {
    const r = await c.query("select '2001:db8::1'::inet, '192.168.1.5/24'::inet")
    expect(cellN(r, 0)).toBe('2001:db8::1')
    expect(cellN(r, 1)).toBe('192.168.1.5/24')
  })

  test('inet[] decodes to the raw array string (array OID unregistered)', async () => {
    const r = await c.query("select '{192.168.0.1,10.0.0.1}'::inet[] as a")
    expect(cell0(r)).toBe('{192.168.0.1,10.0.0.1}')
  })

  test.todo('opt-in inet decoder -> {address,netmask,family}', () => {})
})

// ---------------------------------------------------------------------------
describe('geometric types', () => {
  test('point/box/circle/lseg/polygon/path/line decode to text literals', async () => {
    const r = await c.query(
      "select '(1,2)'::point, '(2,2),(0,0)'::box, '<(0,0),5>'::circle, '[(0,0),(1,1)]'::lseg, '((0,0),(1,1),(2,0))'::polygon, '[(0,0),(1,1)]'::path, '{1,-1,0}'::line",
    )
    expect(cellN(r, 0)).toBe('(1,2)')
    expect(cellN(r, 1)).toBe('(2,2),(0,0)')
    expect(typeof cellN(r, 2)).toBe('string')
    expect(typeof cellN(r, 3)).toBe('string')
    expect(typeof cellN(r, 4)).toBe('string')
    expect(typeof cellN(r, 5)).toBe('string')
    expect(typeof cellN(r, 6)).toBe('string')
  })

  test('point param round-trips via string literal; <@ box is geometric', async () => {
    const rt = await c.query('select $1::point as p', ['(1,2)'])
    expect(cell0(rt)).toBe('(1,2)')
    const contained = await c.query("select '(1,1)'::point <@ $1::box as x", ['(2,2),(0,0)'])
    const outside = await c.query("select '(5,5)'::point <@ $1::box as x", ['(2,2),(0,0)'])
    expect(cell0(contained)).toBe(true)
    expect(cell0(outside)).toBe(false)
  })

  test('JS object {x,y} bound to point fails 22P02 (no encoder yet)', async () => {
    const err = await caught(() => c.query('select $1::point as p', [{ x: 1, y: 2 }]))
    expect((err as PgError).code).toBe('22P02')
  })

  // The public QueryResult exposes column NAMES only (columns: string[]); field
  // dataTypeOid is not surfaced today -> consumer-side OID routing is roadmap.
  test.todo('field descriptor exposes dataTypeOid (e.g. point === 600)', () => {})
  test.todo('PostGIS geometry returns raw WKB hex string', () => {})
  test.todo('opt-in point decoder/encoder round-trip {x,y} <-> (1,2)', () => {})
})

// ---------------------------------------------------------------------------
describe('hstore (extension, dynamic OID)', () => {
  test('hstore decodes to its raw text literal (dynamic OID unregistered)', async () => {
    if (!hstoreOk) return // extension unavailable -> skip baseline
    const r = await c.query("select 'a=>1, b=>2'::hstore as h")
    expect(cell0(r)).toBe('"a"=>"1", "b"=>"2"')
  })

  test('hstore round-trip via text param + cast', async () => {
    if (!hstoreOk) return
    const r = await c.query('select ($1::hstore -> $2) as v', ['a=>1, b=>2', 'a'])
    expect(cell0(r)).toBe('1')
  })

  test.todo("hstore parser: 'a=>1, b=>2' -> {a:'1',b:'2'}; '' -> {}", () => {})
  test.todo('hstore quoting: embedded ,/=> inside quotes not delimiters', () => {})
  test.todo("hstore NULL: 'a=>NULL' -> {a:null}; 'a=>\"NULL\"' -> {a:'NULL'}", () => {})
  test.todo('hstore round-trip of JS object with quotes/backslash/=>', () => {})
  test.todo('dynamic OID resolution + hstore[] element-wise decode', () => {})
})

// ---------------------------------------------------------------------------
describe('misc advanced scalars — string baseline', () => {
  test('"char" (oid 18) decodes to a 1-char string', async () => {
    const r = await c.query('select \'x\'::"char" as c')
    expect(cell0(r)).toBe('x')
  })

  test('bit/varbit decode to their bit-string text', async () => {
    const r = await c.query("select B'101'::bit(3), B'101'::varbit")
    expect(cellN(r, 0)).toBe('101')
    expect(cellN(r, 1)).toBe('101')
  })

  test('pg_lsn decodes to its text form', async () => {
    const r = await c.query("select '0/16B6B50'::pg_lsn as l")
    expect(cell0(r)).toBe('0/16B6B50')
  })

  test('tsvector / tsquery decode to text', async () => {
    const r = await c.query("select to_tsvector('english','the quick fox')::text as v, 'quick & fox'::tsquery::text as q")
    expect(typeof cellN(r, 0)).toBe('string')
    expect(cellN(r, 0) as string).toContain('quick')
    expect(typeof cellN(r, 1)).toBe('string')
  })

  test('xml decodes to text', async () => {
    const r = await c.query("select '<a>1</a>'::xml as x")
    expect(cell0(r)).toBe('<a>1</a>')
  })

  test('money decodes to a formatted string', async () => {
    const r = await c.query("select '3.50'::money as m")
    expect(typeof cell0(r)).toBe('string')
    expect(cell0(r) as string).toContain('3.50')
  })
})

// ---------------------------------------------------------------------------
describe('custom-type registration & scope isolation', () => {
  test('buildDecoders returns a NEW map and does not mutate defaultDecoders', () => {
    const before = defaultDecoders.get(1700)
    const m = buildDecoders({ 1700: (b) => `BN:${b.toString('utf8')}` })
    expect(m).not.toBe(defaultDecoders)
    expect(m.get(1700)).toBeDefined()
    expect(defaultDecoders.get(1700)).toBe(before) // unchanged (was undefined)
    expect(before).toBeUndefined()
  })

  test('buildDecoders() with no overrides returns the shared default map', () => {
    expect(buildDecoders()).toBe(defaultDecoders)
  })

  test('decoderFor always returns a callable, never undefined', () => {
    const fn = decoderFor(999999, defaultDecoders) // unknown oid
    expect(typeof fn).toBe('function')
    expect(fn(Buffer.from('hello', 'utf8'))).toBe('hello') // asString fallback
  })

  test('a registered numeric (1700) decoder fires for every row of a result', async () => {
    const c2 = await testConnect({ types: { 1700: (b) => `N(${b.toString('utf8')})` } })
    try {
      const r = await c2.query("select g::numeric as n from generate_series(1,3) g")
      expect(r.rows.length).toBe(3)
      expect((r.rows[0] as unknown[])[0]).toBe('N(1)')
      expect((r.rows[1] as unknown[])[0]).toBe('N(2)')
      expect((r.rows[2] as unknown[])[0]).toBe('N(3)')
    } finally {
      await c2.end()
    }
  })

  test('a parser returning a non-primitive object yields that instance unchanged', async () => {
    const marker = { kind: 'bignum' }
    const c2 = await testConnect({ types: { 1700: () => marker } })
    try {
      const r = await c2.query('select 3.14::numeric as n')
      expect(cell0(r)).toBe(marker)
    } finally {
      await c2.end()
    }
  })

  test('decoder registry isolation: conn A override does not affect conn B', async () => {
    const a = await testConnect({ types: { 1700: () => 'A' } })
    const b = await testConnect() // defaults
    try {
      const ra = await a.query('select 1.5::numeric as n')
      const rb = await b.query('select 1.5::numeric as n')
      expect(cell0(ra)).toBe('A')
      expect(cell0(rb)).toBe('1.5') // default: numeric -> string
    } finally {
      await a.end()
      await b.end()
    }
  })

  test('custom decoder receives the raw column Buffer (text bytes)', async () => {
    let seen: Buffer | null = null
    const c2 = await testConnect({
      types: {
        1700: (b) => {
          seen = b
          return b.toString('utf8')
        },
      },
    })
    try {
      await c2.query('select 3.14::numeric as n')
      expect(Buffer.isBuffer(seen)).toBe(true)
      expect((seen as unknown as Buffer).toString('utf8')).toBe('3.14')
    } finally {
      await c2.end()
    }
  })

  test('mode:buffer returns (Buffer|null)[] cells so callers can self-parse', async () => {
    const r = await c.query("select 3.14::numeric as n, null::int4 as z", [], { mode: 'buffer' })
    const row = r.rows[0] as (Buffer | null)[]
    expect(Buffer.isBuffer(row[0])).toBe(true)
    expect((row[0] as Buffer).toString('utf8')).toBe('3.14')
    expect(row[1]).toBeNull()
  })

  test.todo('per-query types override applies only to that query', () => {})
  test.todo('custom SERIALIZER (encode hook) per-OID invoked on bind', () => {})
  test.todo('pgvector end-to-end register-by-name round-trip', () => {})
})

// ---------------------------------------------------------------------------
describe('ALL-COMMON-TYPES round-trip matrix', () => {
  // Scalars that HAVE a non-string decoder in defaultDecoders.
  type DecCase = { oid: number; sql: string; param: unknown; expect: (v: unknown) => void }
  const decoded: DecCase[] = [
    { oid: 16, sql: 'bool', param: true, expect: (v) => expect(v).toBe(true) },
    { oid: 21, sql: 'int2', param: '7', expect: (v) => expect(v).toBe(7) },
    { oid: 23, sql: 'int4', param: '12345', expect: (v) => expect(v).toBe(12345) },
    { oid: 26, sql: 'oid', param: '42', expect: (v) => expect(v).toBe(42) },
    { oid: 700, sql: 'float4', param: '1.5', expect: (v) => expect(v).toBe(1.5) },
    { oid: 701, sql: 'float8', param: '2.25', expect: (v) => expect(v).toBe(2.25) },
    { oid: 114, sql: 'json', param: '{"a":1}', expect: (v) => expect(v).toEqual({ a: 1 }) },
    { oid: 3802, sql: 'jsonb', param: '{"b":2}', expect: (v) => expect(v).toEqual({ b: 2 }) },
  ]
  for (const tc of decoded) {
    test(`decoded scalar ${tc.sql} (oid ${tc.oid}) round-trips to its JS type`, async () => {
      const r = await c.query(`select $1::${tc.sql} as v`, [tc.param])
      tc.expect(cell0(r))
    })
  }

  test('bytea param (Buffer) uses binary format and round-trips byte-exact', async () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff])
    const r = await c.query('select $1::bytea as v', [buf])
    expect(Buffer.isBuffer(cell0(r))).toBe(true)
    expect(Buffer.compare(cell0(r) as Buffer, buf)).toBe(0)
  })

  // Scalars that default to STRING (precision-safe / lossless text). int8 -> BigInt, temporal -> Date (below).
  const stringCases: { sql: string; param: string; eq: string }[] = [
    { sql: 'numeric', param: '1.50', eq: '1.50' },
    { sql: 'text', param: 'hello', eq: 'hello' },
    { sql: 'varchar', param: 'world', eq: 'world' },
    { sql: 'uuid', param: '00000000-0000-0000-0000-000000000001', eq: '00000000-0000-0000-0000-000000000001' },
    { sql: 'time', param: '12:34:56', eq: '12:34:56' }, // date/timestamp default to Date now — asserted below
    { sql: 'interval', param: '1 day', eq: '1 day' },
  ]
  for (const tc of stringCases) {
    test(`string-default scalar ${tc.sql} returns exact text`, async () => {
      const r = await c.query(`select $1::${tc.sql} as v`, [tc.param])
      expect(cell0(r)).toBe(tc.eq)
    })
  }

  test('date / timestamp / timestamptz default to a JS Date', async () => {
    for (const t of ['date', 'timestamp', 'timestamptz']) {
      const r = await c.query(`select $1::${t} as v`, ['2020-01-02 03:04:05'])
      expect(cell0(r)).toBeInstanceOf(Date)
      expect((cell0(r) as Date).toISOString()).toContain('2020-01-02')
    }
  })

  test('int8 / bigint default to a JS BigInt', async () => {
    const r = await c.query('select $1::int8 as v', ['123456789012345'])
    expect(cell0(r)).toBe(123456789012345n)
    expect(typeof cell0(r)).toBe('bigint')
  })

  test('NULL column for each representative type is strictly null, key present', async () => {
    const types = ['bool', 'int4', 'int8', 'numeric', 'text', 'float8', 'json', 'jsonb', 'uuid', 'date']
    for (const t of types) {
      const r = await c.query(`select null::${t} as a`, [], { mode: 'object' })
      const row = r.rows[0] as Record<string, unknown>
      expect('a' in row).toBe(true)
      expect(row.a).toBeNull()
    }
  })

  test('param NULL symmetry: JS null binds to SQL NULL and reads back null', async () => {
    const r = await c.query('select $1::int4 as a', [null])
    expect(cell0(r)).toBeNull()
  })

  test('= ANY($1::int4[]) membership via a STRING array-literal param', async () => {
    const hit = await c.query('select 2 = ANY($1::int4[]) as x', ['{1,2,3}'])
    const miss = await c.query('select 9 = ANY($1::int4[]) as x', ['{1,2,3}'])
    expect(cell0(hit)).toBe(true)
    expect(cell0(miss)).toBe(false)
  })

  test('NUL-byte param is rejected client-side before hitting the socket', async () => {
    const err = await caught(() => c.query('select $1::text as a', [String.fromCharCode(97, 0, 98)]))
    expect((err as Error).message).toMatch(/NUL byte/)
  })
})

// ---------------------------------------------------------------------------
describe('out-of-scope guards', () => {
  test('no sql template tag is exported — query(sql, params) only', async () => {
    const mod = (await import('../../../src/index.ts')) as Record<string, unknown>
    expect(mod.sql).toBeUndefined()
    expect(typeof mod.connect).toBe('function')
  })

  test('multi-statement string errors cleanly (single-statement extended protocol)', async () => {
    const err = await caught(() => c.query('select 1; select 2'))
    expect(err).toBeInstanceOf(PgError)
    expect((err as PgError).code).toBe('42601') // syntax error at end of input
  })
})
