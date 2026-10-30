// The JIT param encoder (compileBindEncoder) must be BYTE-IDENTICAL to the shipped generic path
// writeBindWith(w,'',name,params, compileParamPlan(oids)??encodeValueInto, rf)+writeExecute(w,'',0)+writeSync(w).
// Any divergence is wire corruption, so this is the correctness gate: a broad matrix + a fast-check property
// over random (name, oid, value, resultFormat) combos, comparing raw bytes (and throw-parity).
import { test, expect, describe } from 'bun:test'
import fc from 'fast-check'
import { Writer, writeBindWith, writeExecute, writeSync } from '../../src/protocol.ts'
import { compileParamPlan, compileBindEncoder, encodeValueInto } from '../../src/encode.ts'

const ref = (name: string, oids: number[], params: unknown[], rf: number | number[]): Buffer => {
  const w = new Writer(1 << 16)
  writeBindWith(w, '', name, params, compileParamPlan(oids) ?? encodeValueInto, rf); writeExecute(w, '', 0); writeSync(w)
  return Buffer.from(w.slice())
}
const jit = (name: string, oids: number[], params: unknown[], rf: number | number[]): Buffer | null => {
  const enc = compileBindEncoder(name, oids, rf)
  if (!enc) return null // JIT declined (row width > cap) -> connection uses the generic path
  const w = new Writer(1 << 16)
  enc(w, params)
  return Buffer.from(w.slice())
}
const same = (name: string, oids: number[], params: unknown[], rf: number | number[] = 0) => {
  const j = jit(name, oids, params, rf)
  expect(j).not.toBeNull()
  expect(j!.equals(ref(name, oids, params, rf))).toBe(true)
}
/** true iff JIT bytes == generic bytes, or JIT declined (generic path used), or BOTH throw. */
const bothOrNeither = (name: string, oids: number[], params: unknown[], rf: number | number[]): boolean => {
  let jb: Buffer | null = null, jt = false
  try { jb = jit(name, oids, params, rf) } catch { jt = true }
  if (jb === null && !jt) return true // declined -> generic path, nothing to compare
  let r: Buffer | undefined, rt = false
  try { r = ref(name, oids, params, rf) } catch { rt = true }
  if (rt || jt) return rt === jt
  return jb!.equals(r!)
}

describe('compileBindEncoder byte-identity — matrix', () => {
  test('fast scalars in range (all binary)', () => same('s1', [20, 25, 23, 701, 16, 1184], [1n, 'hi', 42, 3.14, true, new Date('2024-01-15T10:30:45Z')]))
  test('int8 as safe number AND bigint (incl. i64 bounds)', () => { same('', [20], [42]); same('', [20], [9223372036854775807n]); same('', [20], [-9223372036854775808n]); same('', [20], [0n]) })
  test('int2/int4 boundary values', () => { same('', [21], [-32768]); same('', [21], [32767]); same('', [23], [-2147483648]); same('', [23], [2147483647]) })
  test('fast fallbacks: overflow/wrong-type/null -> text, format patched', () => {
    same('', [23], [3000000000])       // int4 overflow -> text digits
    same('', [21], [40000])            // int2 overflow
    same('', [20], [1.5])              // non-integer number -> not safe int? 1.5 IS finite non-integer -> text via encodeValueInto
    same('', [20], ['12345678901234567890']) // int8 string -> text
    same('', [16], [null]); same('', [701], [null]); same('', [20], [null]); same('', [1184], [null])
    same('', [23], [1n])               // bigint on int4 -> text
    same('', [701], ['3.14'])          // string on float8 -> text
    same('', [16], [1])                // number on bool -> text ('1'? no: encodeValueInto(1) -> lpAsciiInt)
  })
  test('Buffer on a fast column -> binary passthrough (format stays 1)', () => same('', [20], [Buffer.from('deadbeef', 'hex')]))
  test('timestamp/timestamptz: epoch, far past/future (BigInt micros)', () => {
    same('', [1114, 1184], [new Date('2000-01-01T00:00:00Z'), new Date('1970-01-01T00:00:00Z')])
    same('', [1184], [new Date('9999-12-31T23:59:59Z')]); same('', [1114], [new Date('0100-01-01T00:00:00Z')])
  })
  test('non-fast scalars: numeric/uuid/json/jsonb', () => {
    same('', [1700], ['1.50']); same('', [2950], ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'])
    same('', [114], [{ a: 1, b: [2, 3] }]); same('', [3802], [{ x: 'y' }])
    same('', [114], [[1, 2, 3]])        // declared json + array -> JSON, not arrayLiteral
    same('', [114], [null]); same('', [3802], [null]) // json null: current behavior (JSON.stringify(null)='null')
    same('', [114], ['{"pre":"serialized"}'])
  })
  test('arrays: fast-binary, text-literal, empty, null-elem, nested, quoting', () => {
    same('', [1007], [[1, 2, 3]]); same('', [1016], [[1n, 2n]]); same('', [1009], [['a,b', 'c"d', null, '']])
    same('', [1231], [['1.5', '10.50']]); same('', [2951], [['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11']]) // text-literal arrays
    same('', [1007], [[]]); same('', [1007], [[1, null, 3]]); same('', [1007], [[[1, 2], [3, 4]]])
    same('', [199], [[{ a: 1 }, { b: 2 }]]) // json[] with object elements
  })
  test('mixed statement (fast + non-fast + array)', () => same('mix', [23, 1700, 1007, 25, 20], [7, '9.99', [1, 2], 'txt', 5n]))
  test('statement names: unnamed, named, unicode', () => { same('', [23], [1]); same('_c0', [23], [1]); same('стейтмент', [20], [9n]) })
  test('result formats: scalar 0/1, per-column array, empty', () => {
    same('', [23], [1], 0); same('', [23], [1], 1); same('', [23, 25], [1, 'x'], [0, 1]); same('', [23], [1], [])
  })
  test('zero params', () => { same('p0', [], [], 0); same('p0', [], [], [0, 0]) })
  test('throw-parity: NUL string / invalid Date throw in BOTH paths', () => {
    expect(bothOrNeither('', [25], ['a\0b'], 0)).toBe(true)
    expect(bothOrNeither('', [1184], [new Date(NaN)], 0)).toBe(true)
    expect(bothOrNeither('', [114], [{ big: 1n }], 0)).toBe(true) // JSON.stringify(bigint) throws
  })
})

describe('compileBindEncoder byte-identity — VALUES batches (repeating row period) + unnest', () => {
  test('6-col fast row × 3', () => {
    const row = [20, 25, 23, 701, 16, 1184]
    same('mv', [...row, ...row, ...row], [
      1n, 'a', 2, 1.5, true, new Date('2024-01-01T00:00:00Z'),
      3n, 'b', 4, 2.5, false, new Date('2024-06-01T00:00:00Z'),
      5n, 'c', 6, 3.5, true, new Date('2020-01-01T00:00:00Z'),
    ])
  })
  test('per-row fallbacks patch the correct format offsets', () => {
    const row = [23, 25] // int4, text
    same('', [...row, ...row, ...row], [3000000000, 'ok', 5, 'hi', 7n, 'z']) // row0 int4 overflow, row2 int4=bigint -> text
  })
  test('VALUES batch with an array column (period includes a non-fast column)', () => {
    const row = [1007, 25] // int4[], text
    same('', [...row, ...row], [[1, 2], 'a', [3, null, 4], 'b'])
  })
  test('period 1 (single column) and period 2 × many', () => {
    same('', [23, 23, 23, 23, 23], [1, 2, 3, 4, 5])
    same('', [20, 25, 20, 25, 20, 25, 20, 25], [1n, 'a', 2n, 'b', 3n, 'c', 4n, 'd'])
  })
  test('unnest shape: 6 DISTINCT array columns, single row (period = n)', () => {
    same('un', [1016, 1009, 1007, 1022, 1000, 1185], [[1n, 2n], ['a', 'b'], [1, 2], [1.5], [true, false], [new Date('2024-01-01T00:00:00Z')]])
  })
  test('per-column result-format array on a VALUES batch', () => {
    const row = [23, 25]
    same('', [...row, ...row], [1, 'a', 2, 'b'], [0, 1, 0, 1])
  })
})

describe('compileBindEncoder byte-identity — property (fast-check)', () => {
  const OID = fc.constantFrom(20, 23, 21, 701, 16, 1114, 1184, 25, 1043, 1700, 2950, 114, 3802, 1007, 1016, 1231, 1009)
  const VAL = fc.oneof(
    fc.integer({ min: -5_000_000_000, max: 5_000_000_000 }),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.boolean(),
    fc.string().filter((s) => !s.includes('\0')),
    fc.constant(null),
    fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n }),
    fc.date({ min: new Date('1900-01-01'), max: new Date('2200-01-01') }),
    fc.array(fc.oneof(fc.integer({ min: -50, max: 50 }), fc.constant(null)), { maxLength: 5 }),
    fc.array(fc.string().filter((s) => !s.includes('\0')), { maxLength: 4 }),
  )
  const RF = fc.oneof(fc.constantFrom(0, 1), fc.array(fc.constantFrom(0, 1), { maxLength: 4 }))

  test('random (name, oids, values, resultFormat) — 4000 runs', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.includes('\0')),
        fc.array(fc.tuple(OID, VAL), { maxLength: 8 }),
        RF,
        (name, pairs, rf) => bothOrNeither(name, pairs.map((p) => p[0]), pairs.map((p) => p[1]), rf),
      ),
      { numRuns: 4000 },
    )
  })
})
