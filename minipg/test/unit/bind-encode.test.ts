// Write-through Bind encoding (protocol.ts Writer lp* primitives + writeBindWith, encode.ts
// encodeValueInto + compileParamPlan). The core invariant: the write-through TEXT path emits
// byte-identical wire bytes to the legacy encodeParam + writeBind chain.
import { test, expect, describe } from 'bun:test'
import fc from 'fast-check'
import { Writer, writeBind, writeBindWith, writeParse, parseParameterDescription } from '../../src/protocol.ts'
import { encodeParam, encodeValueInto, compileParamPlan } from '../../src/encode.ts'

const legacyBytes = (params: unknown[], resultFormat: number | number[] = 0): Buffer => {
  const w = new Writer()
  writeBind(w, 'p', 'st', params.map(encodeParam), resultFormat)
  return Buffer.from(w.slice())
}
const throughBytes = (params: unknown[], resultFormat: number | number[] = 0): Buffer => {
  const w = new Writer()
  writeBindWith(w, 'p', 'st', params, encodeValueInto, resultFormat)
  return Buffer.from(w.slice())
}

// minimal Bind ('B') message reader for inspecting what a plan produced
function readBind(b: Buffer): { fmts: number[]; vals: (Buffer | null)[] } {
  expect(String.fromCharCode(b[0]!)).toBe('B')
  let off = 5
  off = b.indexOf(0, off) + 1 // portal
  off = b.indexOf(0, off) + 1 // statement
  const nf = b.readInt16BE(off); off += 2
  const fmts: number[] = []
  for (let i = 0; i < nf; i++) { fmts.push(b.readInt16BE(off)); off += 2 }
  const np = b.readInt16BE(off); off += 2
  const vals: (Buffer | null)[] = []
  for (let i = 0; i < np; i++) {
    const l = b.readInt32BE(off); off += 4
    if (l === -1) vals.push(null)
    else { vals.push(b.subarray(off, off + l)); off += l }
  }
  return { fmts, vals }
}
const planBind = (oids: number[], params: unknown[]): { fmts: number[]; vals: (Buffer | null)[] } => {
  const plan = compileParamPlan(oids)
  expect(plan).not.toBeNull()
  const w = new Writer()
  writeBindWith(w, '', 's', params, plan!, 0)
  return readBind(Buffer.from(w.slice()))
}

describe('write-through TEXT encoding is byte-identical to encodeParam + writeBind', () => {
  test('representative values', () => {
    const params = [
      null, undefined, 0, -0, 1, -1, 42, -32768, 2147483647, -2147483648,
      Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 1e21, -1e21, 0.25, -1234.5678,
      NaN, Infinity, -Infinity, 1.7976931348623157e308,
      'plain', '', 'üñíçødé ⚡', 'quotes "and" \\slashes\n\ttabs',
      true, false, 123n, -9223372036854775808n,
      new Date('2026-07-05T12:34:56.789Z'), new Date(0),
      { a: 1, b: [true, null, 'x'] }, [1, 2, 3],
      Buffer.from([0, 1, 2, 255]), Buffer.alloc(0),
    ]
    expect(Buffer.compare(throughBytes(params), legacyBytes(params))).toBe(0)
    expect(Buffer.compare(throughBytes(params, 1), legacyBytes(params, 1))).toBe(0)
    expect(Buffer.compare(throughBytes(params, [0, 1]), legacyBytes(params, [0, 1]))).toBe(0)
  })

  test('property: arbitrary value mixes', () => {
    const value = fc.oneof(
      fc.integer(), fc.double(), fc.bigInt(),
      fc.string().filter((s) => !s.includes('\0')),
      fc.boolean(), fc.constant(null),
      fc.date({ noInvalidDate: true }),
      fc.uint8Array().map((u) => Buffer.from(u)),
      fc.jsonValue().filter((j) => j !== null && JSON.stringify(j) !== undefined),
    )
    fc.assert(fc.property(fc.array(value, { maxLength: 12 }), (params) => {
      return Buffer.compare(throughBytes(params), legacyBytes(params)) === 0
    }), { numRuns: 300 })
  })

  test('NUL byte in a string still throws (same message)', () => {
    expect(() => throughBytes(['a\0b'])).toThrow(/NUL byte/)
    expect(() => legacyBytes(['a\0b'])).toThrow(/NUL byte/)
  })
})

describe('Writer int64 primitive', () => {
  test('lpI64 (number halves) matches BigInt64 encoding for all safe-integer shapes', () => {
    const ref = (v: bigint): Buffer => { const b = Buffer.allocUnsafe(8); b.writeBigInt64BE(v); return b }
    const cases = [0, 1, -1, 2 ** 31, -(2 ** 31) - 5, 2 ** 32, -(2 ** 32) - 5, 4294967295, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]
    for (const v of cases) {
      const w = new Writer(); w.lpI64(v)
      const got = Buffer.from(w.slice())
      expect(got.readInt32BE(0)).toBe(8)
      expect(Buffer.compare(got.subarray(4), ref(BigInt(v)))).toBe(0)
    }
    fc.assert(fc.property(fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }), (v) => {
      const w = new Writer(); w.lpI64(v)
      return Buffer.compare(Buffer.from(w.slice()).subarray(4), ref(BigInt(v))) === 0
    }), { numRuns: 500 })
  })

  test('lpAsciiInt matches String(v)', () => {
    fc.assert(fc.property(fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }), (v) => {
      const w = new Writer(); w.lpAsciiInt(v)
      const b = Buffer.from(w.slice())
      return b.toString('utf8', 4) === String(v) && b.readInt32BE(0) === Buffer.byteLength(String(v))
    }), { numRuns: 500 })
  })
})

describe('binary param plans', () => {
  const OIDS = [20, 25, 23, 701, 16, 1184, 21] // int8, text, int4, float8, bool, timestamptz, int2

  test('fast types encode binary; text stays text', () => {
    const d = new Date('2026-07-05T12:34:56.789Z')
    const { fmts, vals } = planBind(OIDS, [5, 'hi', -7, 2.5, true, d, -123])
    expect(fmts).toEqual([1, 0, 1, 1, 1, 1, 1])
    expect(vals[0]!.readBigInt64BE(0)).toBe(5n)
    expect(vals[1]!.toString()).toBe('hi')
    expect(vals[2]!.readInt32BE(0)).toBe(-7)
    expect(vals[3]!.readDoubleBE(0)).toBe(2.5)
    expect(vals[4]![0]).toBe(1)
    expect(vals[5]!.readBigInt64BE(0)).toBe(BigInt(d.getTime() - 946684800000) * 1000n)
    expect(vals[6]!.readInt16BE(0)).toBe(-123)
  })

  test('per-value fallback to text when the JS value does not fit the OID', () => {
    const { fmts, vals } = planBind(
      [23, 20, 20, 1184, 16, 21],
      [2 ** 40 /* > int4 */, '42' /* string for int8 */, 2 ** 60 /* unsafe number */, 'not a date', 'yes', 40000 /* > int2 */],
    )
    expect(fmts).toEqual([0, 0, 0, 0, 0, 0]) // every one fell back
    expect(vals[0]!.toString()).toBe(String(2 ** 40)) // server raises the proper 22003, semantics unchanged
    expect(vals[1]!.toString()).toBe('42')
    expect(vals[2]!.toString()).toBe(String(2 ** 60))
    expect(vals[3]!.toString()).toBe('not a date')
    expect(vals[5]!.toString()).toBe('40000')
  })

  test('bigint int8 + far-from-epoch timestamps take the BigInt-exact paths', () => {
    const far = new Date('2400-01-01T00:00:00.000Z') // >285yr from 2000 -> BigInt micros
    const { fmts, vals } = planBind([20, 1184], [9223372036854775807n, far])
    expect(fmts).toEqual([1, 1])
    expect(vals[0]!.readBigInt64BE(0)).toBe(9223372036854775807n)
    expect(vals[1]!.readBigInt64BE(0)).toBe(BigInt(far.getTime() - 946684800000) * 1000n)
  })

  test('NULL params stay NULL under a plan', () => {
    const { fmts, vals } = planBind([20, 701], [null, undefined])
    expect(vals).toEqual([null, null])
    expect(fmts).toEqual([0, 0])
  })

  test('plan is null when nothing is binary-able; extra params beyond the plan fall back', () => {
    expect(compileParamPlan([25, 1700])).toBeNull() // text, numeric: no binary encoder -> null plan
    expect(compileParamPlan([])).toBeNull()
    expect(compileParamPlan([3802])).not.toBeNull() // jsonb NOW has a JSON-forcing encoder (declared json wins over the array-literal default)
    expect(compileParamPlan([1231])).not.toBeNull() // numeric[] NOW routes through arrayEnc (text-literal fallback)
    const { fmts, vals } = planBind([20], [1, 'extra'])
    expect(fmts).toEqual([1, 0])
    expect(vals[1]!.toString()).toBe('extra')
  })
})

describe('Parse / ParameterDescription plumbing', () => {
  test('writeParse carries declared param OIDs', () => {
    const w = new Writer()
    writeParse(w, 'nm', 'select $1, $2', [20, 25])
    const b = Buffer.from(w.slice())
    let off = 5
    off = b.indexOf(0, off) + 1 // name
    off = b.indexOf(0, off) + 1 // sql
    expect(b.readInt16BE(off)).toBe(2)
    expect(b.readInt32BE(off + 2)).toBe(20)
    expect(b.readInt32BE(off + 6)).toBe(25)
  })

  test('parseParameterDescription', () => {
    const body = Buffer.alloc(2 + 8)
    body.writeInt16BE(2, 0); body.writeInt32BE(1184, 2); body.writeInt32BE(20, 6)
    expect(parseParameterDescription(body)).toEqual([1184, 20])
    expect(parseParameterDescription(Buffer.from([0, 0]))).toEqual([])
  })
})
