// Binary array param encoding (encode.ts arrayEnc/elemEncoderFor/arrayLiteral) and the
// params-name resolver (spec.ts paramTypeOid). Wire layout asserted against the documented
// array_recv format: ndim, hasnull, elemOid, [len, lbound], elements.
import { test, expect, describe } from 'bun:test'
import { Writer } from '../../src/protocol.ts'
import { writeBindWith } from '../../src/protocol.ts'
import { compileParamPlan, arrayLiteral, encodeParam, encodeJsonParam, encodeJsonParams } from '../../src/encode.ts'
import { paramTypeOid, resolveParamTypes } from '../../src/spec.ts'

function bindVals(oids: number[], params: unknown[]): { fmts: number[]; vals: (Buffer | null)[] } {
  const plan = compileParamPlan(oids)
  expect(plan).not.toBeNull()
  const w = new Writer()
  writeBindWith(w, '', 's', params, plan!, 0)
  const b = Buffer.from(w.slice())
  let off = 5
  off = b.indexOf(0, off) + 1
  off = b.indexOf(0, off) + 1
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

describe('paramTypeOid / resolveParamTypes', () => {
  test('aliases, array forms, raw OIDs', () => {
    expect(paramTypeOid('int8')).toBe(20)
    expect(paramTypeOid('bigint[]')).toBe(1016)
    expect(paramTypeOid('TIMESTAMPTZ[]')).toBe(1185)
    expect(paramTypeOid(701)).toBe(701)
    expect(resolveParamTypes(['int8[]', 'text[]', 23])).toEqual([1016, 1009, 23])
    expect(() => paramTypeOid('nope')).toThrow(/unknown param type/)
    expect(() => paramTypeOid('nope[]')).toThrow(/unknown param type/)
  })
  test('resolution is cached by array identity', () => {
    const a = ['int4[]'] as const
    expect(resolveParamTypes(a)).toBe(resolveParamTypes(a))
  })
})

describe('binary array wire format', () => {
  test('int8[] with a NULL: ndim/hasnull/elemOid/dims/elements', () => {
    const { fmts, vals } = bindVals([1016], [[1, null, -3]])
    expect(fmts).toEqual([1])
    const v = vals[0]!
    expect(v.readInt32BE(0)).toBe(1)     // ndim
    expect(v.readInt32BE(4)).toBe(1)     // hasnull
    expect(v.readInt32BE(8)).toBe(20)    // elem oid
    expect(v.readInt32BE(12)).toBe(3)    // dim length
    expect(v.readInt32BE(16)).toBe(1)    // lower bound
    expect(v.readInt32BE(20)).toBe(8); expect(v.readBigInt64BE(24)).toBe(1n)
    expect(v.readInt32BE(32)).toBe(-1)   // NULL element
    expect(v.readInt32BE(36)).toBe(8); expect(v.readBigInt64BE(40)).toBe(-3n)
    expect(v.length).toBe(48)
  })

  test('empty array is ndim=0', () => {
    const { fmts, vals } = bindVals([1007], [[]])
    expect(fmts).toEqual([1])
    const v = vals[0]!
    expect(v.readInt32BE(0)).toBe(0)
    expect(v.readInt32BE(4)).toBe(0)
    expect(v.readInt32BE(8)).toBe(23)
    expect(v.length).toBe(12)
  })

  test('text[] elements are raw utf8 (no literal escaping needed)', () => {
    const s = 'quote " back \\ slash, comma, {brace}'
    const { fmts, vals } = bindVals([1009], [[s, 'b']])
    expect(fmts).toEqual([1])
    const v = vals[0]!
    const l0 = v.readInt32BE(20)
    expect(v.toString('utf8', 24, 24 + l0)).toBe(s)
  })

  test('timestamptz[] elements are epoch-2000 micros; bool[] single bytes', () => {
    const d = new Date('2026-07-05T12:34:56.789Z')
    const ts = bindVals([1185], [[d]]).vals[0]!
    expect(ts.readBigInt64BE(24)).toBe(BigInt(d.getTime() - 946684800000) * 1000n)
    const bl = bindVals([1000], [[true, false]]).vals[0]!
    expect([bl[24], bl[29]]).toEqual([1, 0])
  })

  test('mismatched element bails the WHOLE array to a text literal', () => {
    const { fmts, vals } = bindVals([1016], [[1, 'x', 3]])
    expect(fmts).toEqual([0])
    expect(vals[0]!.toString()).toBe('{1,"x",3}')
  })

  test('nested arrays fall back to a (multidim) literal; string passes through as text', () => {
    const nested = bindVals([1007], [[[1, 2], [3, 4]]])
    expect(nested.fmts).toEqual([0])
    expect(nested.vals[0]!.toString()).toBe('{{1,2},{3,4}}')
    const lit = bindVals([1016], ['{5,6}'])
    expect(lit.fmts).toEqual([0])
    expect(lit.vals[0]!.toString()).toBe('{5,6}')
  })
})

describe('arrayLiteral', () => {
  test('escaping, NULLs, dates, buffers, nesting', () => {
    expect(arrayLiteral([1, null, true, false, 'a"b\\c'])).toBe('{1,NULL,t,f,"a\\"b\\\\c"}')
    expect(arrayLiteral([new Date('2026-01-01T00:00:00.000Z')])).toBe('{"2026-01-01T00:00:00.000Z"}')
    expect(arrayLiteral([Buffer.from([0xde, 0xad])])).toBe('{"\\\\xdead"}')
    expect(arrayLiteral([[1], [2]])).toBe('{{1},{2}}')
    expect(arrayLiteral([])).toBe('{}')
  })
})

// The HTTP transports' JSON-request encoding (minipg/http + minipg/neon-http). An array used to be
// JSON.stringify'd here — '["a","b"]' — which Postgres rejects with 22P02 malformed array literal.
describe('encodeJsonParam / encodeJsonParams (HTTP request encoding)', () => {
  test('encodeJsonParam matches the wire encoder for arrays, objects, bytea, Date and BigInt', () => {
    const wire = (v: unknown): string => encodeParam(v).bytes!.toString('utf8')
    for (const v of [['abc', 'def'], [1, 2, 3], [], [null, 'x'], [['a'], ['b']], [{ a: 1 }]]) {
      expect(encodeJsonParam(v)).toBe(wire(v)) // '{"abc","def"}', NOT '["abc","def"]'
    }
    expect(encodeJsonParam(['abc', 'def'])).toBe('{"abc","def"}') // PG array literal (elements quoted), not JSON
    expect(encodeJsonParam({ a: 1 })).toBe('{"a":1}') // plain object: still JSON text
    expect(encodeJsonParam(null)).toBeNull()
    expect(encodeJsonParam(new Date('2024-01-02T03:04:05Z'))).toBe('2024-01-02T03:04:05.000Z')
    expect(encodeJsonParam(9007199254740993n)).toBe('9007199254740993')
    expect(encodeJsonParam(Buffer.from('deadbeef', 'hex'))).toBe('\\xdeadbeef')
  })

  test("a DECLARED json/jsonb param sends JSON text even when the value is an array (wire parity)", () => {
    expect(encodeJsonParam(['a'], 3802)).toBe('["a"]')
    expect(encodeJsonParam(['a'], 114)).toBe('["a"]')
    expect(encodeJsonParam({ a: 1 }, 3802)).toBe('{"a":1}')
    expect(encodeJsonParam('{"already":"json"}', 3802)).toBe('{"already":"json"}') // pre-serialized passes through
  })

  test('encodeJsonParams applies OIDs positionally (and never mistakes the map index for one)', () => {
    expect(encodeJsonParams([['a'], ['b']], [3802, 1009])).toEqual(['["a"]', '{"b"}'])
    expect(encodeJsonParams([['a'], ['b']])).toEqual(['{"a"}', '{"b"}'])
  })
})
