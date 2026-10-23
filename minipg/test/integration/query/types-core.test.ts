// types-core — core scalar type decode/encode/NULL round-trips for minipg.
// Grounded in src/encode.ts: text-format decode only; int8/numeric/money default
// to STRING (precision-safe), bool->boolean, bytea->Buffer, ints/floats->number,
// everything else (uuid, name, money, bit, arrays, ...) -> UTF-8 string.
// Requires a running cluster: `bun run test:setup`. public.t is READ-ONLY.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { createHash, randomBytes } from 'node:crypto'
import { testConnect, caught, PgError, TEST_TIMEOUT } from '../../helpers/db.ts'
import { defaultDecoders } from '../../../src/index.ts'
import { buildDecoders } from '../../../src/decode.ts'
import type { Connection } from '../../../src/index.ts'

// --- tiny accessors honoring noUncheckedIndexedAccess ---------------------
const aCell = (r: { rows: unknown[] }, i = 0, j = 0): unknown => (r.rows[i] as unknown[])[j]
const oCell = (r: { rows: unknown[] }, col: string, i = 0): unknown => (r.rows[i] as Record<string, unknown>)[col]

let c: Connection
beforeAll(async () => { c = await testConnect() })
afterAll(async () => { await c.end() })

// ===========================================================================
describe('int2 / int4 — number decode', () => {
  test('positive/negative + int2 bounds decode to JS number with exact values', async () => {
    const r = await c.query('select 1::int4 a, (-5)::int4 b, 32767::int2 c, (-32768)::int2 d')
    const row = r.rows[0] as unknown[]
    expect(row.map((x) => typeof x)).toEqual(['number', 'number', 'number', 'number'])
    expect(row).toEqual([1, -5, 32767, -32768])
  })

  test('NULL::int4 / NULL::int2 decode to JS null, never 0/NaN', async () => {
    const r = await c.query('select NULL::int4 a, NULL::int2 b')
    expect(aCell(r, 0, 0)).toBeNull()
    expect(aCell(r, 0, 1)).toBeNull()
  })

  test('int4 boundary values round-trip exactly as numbers', async () => {
    const r = await c.query('select 2147483647::int4 a, (-2147483648)::int4 b')
    expect(aCell(r, 0, 0)).toBe(2147483647)
    expect(aCell(r, 0, 1)).toBe(-2147483648)
  })

  test('param-bind: JS 0 to $1::int4 returns 0 (not null/empty)', async () => {
    const r = await c.query('select $1::int4 a', [0])
    expect(aCell(r)).toBe(0)
    expect(typeof aCell(r)).toBe('number')
  })

  test('beyond-int4 value rejects with PgError 22003; connection stays usable', async () => {
    const err = await caught(() => c.query('select $1::int4 a', [2147483648]))
    expect(err).toBeInstanceOf(PgError)
    expect((err as PgError).code).toBe('22003')
    const ok = await c.query('select 7::int4 a')
    expect(aCell(ok)).toBe(7)
  })

  test('oid (OID 26) decodes via asNumber to a JS number', async () => {
    const r = await c.query("select 'int4'::regtype::oid a")
    expect(typeof aCell(r)).toBe('number')
    expect(aCell(r)).toBe(23)
  })
})

// ===========================================================================
describe('int8 -> BigInt; numeric / money -> precision-safe string', () => {
  test('max bigint returns a BigInt, not a rounded Number', async () => {
    const r = await c.query('select 9223372036854775807::int8 a')
    expect(typeof aCell(r)).toBe('bigint')
    expect(aCell(r)).toBe(9223372036854775807n)
  })

  test('2^53+1 round-trips as BigInt with no precision loss', async () => {
    const r = await c.query('select 9007199254740993::int8 a')
    expect(aCell(r)).toBe(9007199254740993n)
    // sanity: the Number path WOULD corrupt this; BigInt is exact
    expect(Number('9007199254740993')).toBe(9007199254740992)
  })

  test('small-scale numeric is not truncated to 0', async () => {
    const r = await c.query('select 0.0268::numeric a')
    expect(aCell(r)).toBe('0.0268')
  })

  test('huge numeric round-trips losslessly as canonical PG text', async () => {
    const r = await c.query('select 12345678901234567890.12345::numeric a')
    expect(aCell(r)).toBe('12345678901234567890.12345')
  })

  test('numeric(8,2) preserves trailing-zero scale', async () => {
    const r = await c.query('select 0.3::numeric(8,2) a')
    expect(aCell(r)).toBe('0.30')
  })

  test('COUNT(*) over t returns int8 as a BigInt', async () => {
    const r = await c.query('select count(*) a from public.t')
    expect(typeof aCell(r)).toBe('bigint')
    expect(aCell(r)).toBe(3n)
  })

  test('SUM over an int8 column returns a precision-preserving string', async () => {
    // n8 row1 = 9007199254740993, row2 = 42 -> sum 9007199254741035
    const r = await c.query('select sum(n8) a from public.t')
    expect(typeof aCell(r)).toBe('string')
    expect(aCell(r)).toBe('9007199254741035')
  })

  test('money (OID 790) falls back to raw locale string', async () => {
    const r = await c.query('select 1234.56::money a')
    expect(typeof aCell(r)).toBe('string')
    expect(aCell(r)).toMatch(/1[.,]?234[.,]56/)
  })

  test('NULL::int8 / NULL::numeric decode to JS null, never NaN', async () => {
    const r = await c.query('select NULL::int8 a, NULL::numeric b')
    expect(aCell(r, 0, 0)).toBeNull()
    expect(aCell(r, 0, 1)).toBeNull()
  })

  test('JS null param for numeric/int8 stores SQL NULL, not literal NaN', async () => {
    const r = await c.query('select ($1::numeric IS NULL) a, ($2::int8 IS NULL) b', [null, null])
    expect(aCell(r, 0, 0)).toBe(true)
    expect(aCell(r, 0, 1)).toBe(true)
  })

  test("'NaN'::numeric returns the string 'NaN' under default decoder", async () => {
    const r = await c.query("select 'NaN'::numeric a")
    expect(aCell(r)).toBe('NaN')
    expect(typeof aCell(r)).toBe('string')
  })

  test('bigserial/int8 PK column comes back as BigInt (via temp table)', async () => {
    await c.query('create temp table tc_bs(id bigserial primary key, v text)')
    const r = await c.query("insert into tc_bs(v) values ('x') returning id")
    expect(typeof aCell(r)).toBe('bigint')
    expect(aCell(r)).toBe(1n)
    await c.query('drop table tc_bs')
  })
})

// ===========================================================================
describe('float4 / float8 — number decode incl. special values', () => {
  test('float8 decodes to JS number', async () => {
    const r = await c.query('select 1.5::float8 a')
    expect(typeof aCell(r)).toBe('number')
    expect(aCell(r)).toBe(1.5)
  })

  test('MAX_SAFE_INTEGER float8 round-trips exactly', async () => {
    const r = await c.query('select 9007199254740991::float8 a')
    expect(aCell(r)).toBe(9007199254740991)
  })

  test("'NaN'::float8 decodes to JS NaN", async () => {
    const r = await c.query("select 'NaN'::float8 a")
    expect(Number.isNaN(aCell(r) as number)).toBe(true)
  })

  test("'Infinity' / '-Infinity'::float8 decode to JS Infinities", async () => {
    const r = await c.query("select 'Infinity'::float8 a, '-Infinity'::float8 b")
    expect(aCell(r, 0, 0)).toBe(Infinity)
    expect(aCell(r, 0, 1)).toBe(-Infinity)
  })

  test('NULL::float8 decodes to JS null (not NaN)', async () => {
    const r = await c.query('select NULL::float8 a')
    expect(aCell(r)).toBeNull()
  })

  test('float4 narrowing: 0.1::float4 equals Number of its emitted text', async () => {
    const r = await c.query('select 0.1::float4 a')
    expect(typeof aCell(r)).toBe('number')
    expect(aCell(r)).toBe(Number('0.1'))
  })
})

// ===========================================================================
describe('bool — t/f decode and JS-boolean encode', () => {
  test('true/false decode to JS booleans', async () => {
    const r = await c.query('select true a, false b')
    expect(aCell(r, 0, 0)).toBe(true)
    expect(aCell(r, 0, 1)).toBe(false)
  })

  test('NULL::bool decodes to JS null (not false)', async () => {
    const r = await c.query('select NULL::bool a')
    expect(aCell(r)).toBeNull()
  })

  test('binding JS true/false round-trips to booleans', async () => {
    const r = await c.query('select $1::bool a, $2::bool b', [true, false])
    expect(aCell(r, 0, 0)).toBe(true)
    expect(aCell(r, 0, 1)).toBe(false)
  })

  test('null to a boolean column stores SQL NULL, reads back null', async () => {
    await c.query('create temp table tc_bool(b boolean)')
    await c.query('insert into tc_bool(b) values ($1)', [null])
    const r = await c.query('select b from tc_bool')
    expect(aCell(r)).toBeNull()
    await c.query('drop table tc_bool')
  })

  test('truthy/falsy bool literals are cast by PG (driver passes verbatim)', async () => {
    for (const v of ['t', 'true', 'yes', 'on', '1']) {
      const r = await c.query('select $1::bool a', [v])
      expect(aCell(r)).toBe(true)
    }
    for (const v of ['f', 'false', 'no', 'off', '0']) {
      const r = await c.query('select $1::bool a', [v])
      expect(aCell(r)).toBe(false)
    }
  })

  test("unrecognized 'maybe' into bool rejects with 22P02 (not silent false)", async () => {
    const err = await caught(() => c.query('select $1::bool a', ['maybe']))
    expect(err).toBeInstanceOf(PgError)
    expect((err as PgError).code).toBe('22P02')
  })

  test('bit / bit(n) fall back to asString', async () => {
    const r = await c.query("select B'101'::bit(3) a, B'1'::bit b")
    expect(aCell(r, 0, 0)).toBe('101')
    expect(aCell(r, 0, 1)).toBe('1')
  })
})

// ===========================================================================
describe('text / varchar / char(n) / name — string fidelity', () => {
  test('backslash sequence "a\\nb" survives as 4 literal chars', async () => {
    const input = 'a\\nb' // a, backslash, n, b
    const r = await c.query('select $1::text a', [input])
    expect(aCell(r)).toBe(input)
    expect((aCell(r) as string).length).toBe(4)
  })

  test('real newline (0x0A) round-trips as a real newline byte', async () => {
    const input = 'line1\nline2'
    const r = await c.query('select $1::text a', [input])
    expect(aCell(r)).toBe(input)
    expect((aCell(r) as string).charCodeAt(5)).toBe(0x0a)
  })

  test('multiple consecutive backslashes survive', async () => {
    const input = 'C:\\\\path'
    const r = await c.query('select $1::text a', [input])
    expect(aCell(r)).toBe(input)
  })

  test('NULL::text -> JS null, never the string "null"', async () => {
    const r = await c.query('select NULL::text a')
    expect(aCell(r)).toBeNull()
  })

  test("empty string '' is distinct from null", async () => {
    const r = await c.query("select ''::text a, NULL::text b")
    expect(aCell(r, 0, 0)).toBe('')
    expect(aCell(r, 0, 1)).toBeNull()
  })

  test('no numeric coercion: leading zeros / digits kept as strings', async () => {
    const r = await c.query("select '007'::text a, '3'::varchar b")
    expect(aCell(r, 0, 0)).toBe('007')
    expect(aCell(r, 0, 1)).toBe('3')
    expect(typeof aCell(r, 0, 1)).toBe('string')
  })

  test("char(5) of 'ab' keeps 3 trailing blank-pad spaces", async () => {
    const r = await c.query("select 'ab'::char(5) a")
    expect(aCell(r)).toBe('ab   ')
    expect((aCell(r) as string).length).toBe(5)
  })

  test('name (OID 19) falls back to asString', async () => {
    const r = await c.query("select 'public'::name a")
    expect(aCell(r)).toBe('public')
  })

  test.todo('citext extension value -> string (extension not creatable here)', () => {})

  test('chaos: concat+varchar-cast shape returns correct rows regardless of select order', async () => {
    for (let i = 0; i < 50; i++) {
      const r = await c.query("select ('x'||$1)::varchar a, $1::int4 b", [i])
      expect(aCell(r, 0, 0)).toBe('x' + i)
      expect(aCell(r, 0, 1)).toBe(i)
    }
  })
})

// ===========================================================================
describe('bytea — hex in/out, NUL bytes, large blobs', () => {
  beforeAll(async () => { await c.query('create temp table tc_bytea(id serial, b bytea)') })
  afterAll(async () => { await c.query('drop table tc_bytea') })

  test('random ~64-byte Buffer round-trips byte-for-byte via a bytea column', async () => {
    const buf = randomBytes(64)
    const ins = await c.query('insert into tc_bytea(b) values ($1) returning b', [buf])
    const got = aCell(ins) as Buffer // default mode runs asBytea decoder
    expect(Buffer.isBuffer(got)).toBe(true)
    expect(got.equals(buf)).toBe(true)
  })

  test('\\xdeadbeef decodes via asBytea to the right bytes', async () => {
    const r = await c.query("select '\\xdeadbeef'::bytea a")
    const got = aCell(r) as Buffer
    expect(Buffer.isBuffer(got)).toBe(true)
    expect(got.equals(Buffer.from([0xde, 0xad, 0xbe, 0xef]))).toBe(true)
  })

  test('Buffer with NUL bytes round-trips full length (binary fmt, guard not fired)', async () => {
    const buf = Buffer.from([1, 0, 2, 0, 3])
    const r = await c.query('select $1::bytea a', [buf])
    const got = aCell(r) as Buffer
    expect(got.equals(buf)).toBe(true)
    expect(got.length).toBe(5)
  })

  test('Buffer with backslash byte stores literal bytes, not bytea escape', async () => {
    const buf = Buffer.from('\\x123f', 'utf8') // literal backslash-x-1-2-3-f text bytes
    const r = await c.query('select $1::bytea a', [buf])
    expect((aCell(r) as Buffer).equals(buf)).toBe(true)
  })

  test('large ~80KB random Buffer round-trips (length + sha256)', async () => {
    const buf = randomBytes(80 * 1024)
    const ins = await c.query('insert into tc_bytea(b) values ($1) returning b', [buf])
    const got = aCell(ins) as Buffer
    expect(got.length).toBe(buf.length)
    expect(createHash('sha256').update(got).digest('hex')).toBe(createHash('sha256').update(buf).digest('hex'))
  })

  test('Buffer param and \\x hex literal produce byte-identical stored bytea', async () => {
    const buf = Buffer.from([0xab, 0xcd, 0xef, 0x01])
    const viaParam = await c.query('select $1::bytea a', [buf])
    const viaLiteral = await c.query("select '\\xabcdef01'::bytea a")
    expect((aCell(viaParam) as Buffer).equals(aCell(viaLiteral) as Buffer)).toBe(true)
  })

  test('NULL::bytea -> JS null', async () => {
    const r = await c.query('select NULL::bytea a')
    expect(aCell(r)).toBeNull()
  })

  test('asBytea legacy branch: a non-\\x value is decoded via utf8', async () => {
    // exercise the decoder directly (bytea_output=hex on this cluster)
    const dec = defaultDecoders.get(17)!
    expect((dec(Buffer.from('hello', 'utf8')) as Buffer).toString('utf8')).toBe('hello')
    expect((dec(Buffer.from('\\xff00', 'utf8')) as Buffer).equals(Buffer.from([0xff, 0x00]))).toBe(true)
  })

  test.todo('Uint8Array/ArrayBuffer bytea param (only Buffer matches encodeParam today)', () => {})
})

// ===========================================================================
describe('uuid — canonical string default + override + invalid input', () => {
  const U = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

  test('uuid decodes to canonical lowercase string (asString fallback)', async () => {
    const r = await c.query(`select '${U}'::uuid a`)
    expect(aCell(r)).toBe(U)
    expect(typeof aCell(r)).toBe('string')
  })

  test('uppercase input returns canonical lowercase (PG normalizes)', async () => {
    const r = await c.query('select $1::uuid a', [U.toUpperCase()])
    expect(aCell(r)).toBe(U)
  })

  test("empty string '' rejects 22P02 (no ''->NULL coercion)", async () => {
    const err = await caught(() => c.query('select $1::uuid a', ['']))
    expect(err).toBeInstanceOf(PgError)
    expect((err as PgError).code).toBe('22P02')
    expect((err as PgError).message).toMatch(/invalid input syntax for type uuid/)
  })

  test("'not-a-uuid' and short uuid both reject 22P02", async () => {
    for (const bad of ['not-a-uuid', U.slice(0, -1)]) {
      const err = await caught(() => c.query('select $1::uuid a', [bad]))
      expect((err as PgError).code).toBe('22P02')
    }
  })

  test('JS null to $1::uuid -> SQL NULL, no error', async () => {
    const r = await c.query('select $1::uuid a', [null])
    expect(aCell(r)).toBeNull()
  })

  test('braced form accepted by PG, round-trips unbraced', async () => {
    const r = await c.query(`select '{${U}}'::uuid a`)
    expect(aCell(r)).toBe(U)
  })

  test('override: register OID 2950 -> 16-byte Buffer decoder (scope isolated)', async () => {
    const uconn = await testConnect({
      types: { 2950: (b) => Buffer.from(b.toString('utf8').replace(/-/g, ''), 'hex') },
    })
    try {
      const r = await uconn.query(`select '${U}'::uuid a, 5::int4 b`)
      const got = aCell(r, 0, 0) as Buffer
      expect(Buffer.isBuffer(got)).toBe(true)
      expect(got.length).toBe(16)
      expect(got.toString('hex')).toBe(U.replace(/-/g, ''))
      expect(aCell(r, 0, 1)).toBe(5) // other types unaffected
    } finally { await uconn.end() }
  })
})

// ===========================================================================
describe('oid type values & numeric handling (unit)', () => {
  test('buildDecoders clones default map; override does not mutate defaults', () => {
    const before = defaultDecoders.get(26)
    const m = buildDecoders({ 26: () => 'custom' })
    expect(m.get(26)!(Buffer.from('1'))).toBe('custom')
    expect(defaultDecoders.get(26)).toBe(before) // untouched
    expect(m.get(23)).toBe(defaultDecoders.get(23)) // other OIDs retain defaults
  })

  test('a column whose OID has no registered decoder falls back to asString', async () => {
    // inet (OID 869) is not in the map
    const r = await c.query("select '10.0.0.1'::inet a")
    expect(aCell(r)).toBe('10.0.0.1')
  })

  test.todo('OID value above signed-int4 max handled as unsigned (roadmap probe)', () => {})
})

// ===========================================================================
describe('UTF-8 fidelity, multibyte & NUL guards', () => {
  test('accented Latin + Euro sign round-trips identically', async () => {
    const s = 'café résumé naïve ÆØÅ €'
    const r = await c.query('select $1::text a', [s])
    expect(aCell(r)).toBe(s)
  })

  test('4-byte emoji round-trips with identical codepoints', async () => {
    const s = '😀'
    const r = await c.query('select $1::text a', [s])
    expect(aCell(r)).toBe(s)
    expect([...(aCell(r) as string)].length).toBe(1)
    expect((aCell(r) as string).codePointAt(0)).toBe(0x1f600)
  })

  test('parameterized accented WHERE matches the right rows', async () => {
    await c.query('create temp table tc_utf(name text)')
    await c.query("insert into tc_utf(name) values ('José'),('Jose')")
    const r = await c.query('select count(*) a from tc_utf where name = $1', ['José'])
    expect(aCell(r)).toBe(1n)
    await c.query('drop table tc_utf')
  })

  test('chaos: many rapid multibyte queries never desync/decode-error', async () => {
    const s = 'données café 日本語 😀'
    for (let i = 0; i < 300; i++) {
      const r = await c.query('select $1::text a', [s])
      expect(aCell(r)).toBe(s)
    }
  }, TEST_TIMEOUT) // 300 sequential round-trips: needs headroom over a WAN link (see MINIPG_TEST_TIMEOUT_MS)

  test('NUL-byte param rejected client-side with /NUL/; connection stays usable', async () => {
    const err = await caught(() => c.query('select $1::text a', ['a\0b']))
    expect((err as Error).message).toMatch(/NUL/)
    const ok = await c.query("select 'fine'::text a")
    expect(aCell(ok)).toBe('fine')
  })

  test('embedded NUL in SQL text rejected client-side; connection usable after', async () => {
    const err = await caught(() => c.query('select 1 /*\0*/ as a'))
    expect((err as Error).message).toMatch(/NUL/)
    const ok = await c.query('select 9::int4 a')
    expect(aCell(ok)).toBe(9)
  })

  test.todo('client_encoding configurable (latin1) — hardcoded utf8 today', () => {})
  test.todo('SQL_ASCII high-bit bytes without client-side decode error — roadmap', () => {})
})

// ===========================================================================
describe('override hook & BigInt (config.types)', () => {
  test('int8 -> BigInt override returns a BigInt', async () => {
    const bconn = await testConnect({ types: { 20: (b) => BigInt(b.toString('utf8')) } })
    try {
      const r = await bconn.query('select 9223372036854775807::int8 a')
      expect(typeof aCell(r)).toBe('bigint')
      expect(aCell(r)).toBe(9223372036854775807n)
    } finally { await bconn.end() }
  })

  test('default int8 is a BigInt (override can still remap it)', async () => {
    const r = await c.query('select 9223372036854775807::int8 a')
    expect(aCell(r)).toBe(9223372036854775807n)
  })

  test('BigInt param encodes implicitly via String(v) (no explicit branch)', async () => {
    expect(String(9223372036854775807n)).toBe('9223372036854775807')
    const r = await c.query('select $1::int8 a', [9223372036854775807n])
    expect(aCell(r)).toBe(9223372036854775807n)
  })

  test('int8[] / numeric[] elements keep the scalar precision defaults (BigInt / exact string)', async () => {
    const r = await c.query("select '{1,9007199254740993}'::int8[] a, '{0.1,0.2}'::numeric[] b")
    expect(aCell(r, 0, 0)).toEqual([1n, 9007199254740993n]) // past 2^53 — a Number would round to ...92
    expect(aCell(r, 0, 1)).toEqual(['0.1', '0.2'])
  })
})

// ===========================================================================
describe('out-of-scope guards', () => {
  test('numeric-string into numeric(9,6) via $1::numeric succeeds (no type-deduction error)', async () => {
    await c.query('create temp table tc_num(v numeric(9,6))')
    await c.query('insert into tc_num(v) values ($1::numeric)', ['0.123456'])
    const r = await c.query('select v from tc_num')
    expect(aCell(r)).toBe('0.123456')
    await c.query('drop table tc_num')
  })

  test('overrides are raw numeric-OID keyed (no types.builtins map required)', () => {
    // The documented surface is config.types: Record<number, Decoder>.
    const m = buildDecoders({ 20: (b) => b.toString('utf8') })
    expect(m.get(20)).toBeInstanceOf(Function)
    expect((defaultDecoders as { builtins?: unknown }).builtins).toBeUndefined()
  })
})
