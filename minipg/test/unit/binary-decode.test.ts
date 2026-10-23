// Unit tests for BINARY wire-format decoding (decode2, opt-in per column via format:'binary'). Each
// value is encoded to the exact bytes PostgreSQL sends in binary result format (wire.bin.*), wrapped
// in a DataRow, and decoded by the codegen binary path — asserting the round-trip. (The live server
// agrees: test/integration/binary-golden.test.ts requests binary from real PG and decodes the same way.)
import { test, expect, describe } from 'bun:test'
import { compileRow } from '../../src/decode.ts'
import type { CodegenCol } from '../../src/decode.ts'
import { buildDecoders } from '../../src/decode.ts'
import * as wire from '../helpers/wire.ts'

const map = buildDecoders()
const decodeBin = (oid: number, cell: Buffer, js?: 'number' | 'string' | 'bigint' | 'date' | 'ms') => {
  const col: CodegenCol = { name: 'c', oid, format: 'binary', ...(js ? { js } : {}) }
  return (compileRow([col], 'object', map)(wire.dataRow([cell])) as Record<string, unknown>).c
}

describe('binary decode round-trips PG binary format', () => {
  test('bool', () => { expect(decodeBin(16, wire.bin.bool(true))).toBe(true); expect(decodeBin(16, wire.bin.bool(false))).toBe(false) })
  test('int2', () => { expect(decodeBin(21, wire.bin.int2(-12345))).toBe(-12345); expect(decodeBin(21, wire.bin.int2(32767))).toBe(32767) })
  test('int4', () => { expect(decodeBin(23, wire.bin.int4(-2147483648))).toBe(-2147483648); expect(decodeBin(23, wire.bin.int4(2000000000))).toBe(2000000000) })
  test('oid (unsigned)', () => { expect(decodeBin(26, wire.bin.oid(4294967295))).toBe(4294967295) })
  test('int8 -> BigInt (default)', () => {
    expect(decodeBin(20, wire.bin.int8(9223372036854775807n))).toBe(9223372036854775807n)
    expect(decodeBin(20, wire.bin.int8(-9223372036854775808n))).toBe(-9223372036854775808n)
  })
  test('int8:string -> exact string', () => {
    expect(decodeBin(20, wire.bin.int8(9223372036854775807n), 'string')).toBe('9223372036854775807')
  })
  test('int8:number -> number (exact <2^53)', () => {
    expect(decodeBin(20, wire.bin.int8(9007199254740000n), 'number')).toBe(9007199254740000)
    expect(decodeBin(20, wire.bin.int8(-42n), 'number')).toBe(-42)
  })
  test('float4', () => { expect(decodeBin(700, wire.bin.float4(3.5))).toBe(3.5); expect(decodeBin(700, wire.bin.float4(Math.fround(3.14)))).toBe(Math.fround(3.14)) })
  test('float8 -> exact (readDoubleBE)', () => {
    for (const x of [3.141592653589793, -0.5, 1.5e300, 0.1, 0]) expect(decodeBin(701, wire.bin.float8(x))).toBe(x)
    expect(decodeBin(701, wire.bin.float8(NaN))).toBeNaN()
  })
  test('timestamptz :ms (ms) and :date', () => {
    const ms = Date.UTC(2021, 5, 2, 12, 34, 56, 789)
    expect(decodeBin(1184, wire.bin.timestamp(ms), 'ms')).toBe(ms)
    expect(decodeBin(1184, wire.bin.timestamp(ms), 'date')).toEqual(new Date(ms))
    expect(decodeBin(1184, wire.bin.timestamp(ms))).toEqual(new Date(ms)) // default -> Date
  })
  test('date :ms and :date', () => {
    const ms = Date.UTC(2021, 5, 2)
    expect(decodeBin(1082, wire.bin.date(ms), 'ms')).toBe(ms)
    expect(decodeBin(1082, wire.bin.date(ms), 'date')).toEqual(new Date(ms))
  })
  test('uuid', () => { const u = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; expect(decodeBin(2950, wire.bin.uuid(u))).toBe(u) })
  test('bytea -> Buffer of raw bytes (no hex)', () => { const buf = Buffer.from('00ffdeadbeef', 'hex'); expect(decodeBin(17, wire.bin.bytea(buf))).toEqual(buf) })
  test('text (binary == utf8 bytes)', () => { expect(decodeBin(25, wire.bin.text('café 😀 €'))).toBe('café 😀 €') })
  test('json/jsonb reject binary (no benefit — request text)', () => {
    expect(() => compileRow([{ name: 'c', oid: 114, format: 'binary' }], 'object', map)).toThrow()
    expect(() => compileRow([{ name: 'c', oid: 3802, format: 'binary' }], 'object', map)).toThrow()
  })
  test('NULL cell -> null', () => { expect(decodeBin(701, null as unknown as Buffer)).toBe(null) })
})

describe('mixed text + binary columns in one row', () => {
  test('binary float8/int8/timestamptz + text numeric/text', () => {
    const cols: CodegenCol[] = [
      { name: 'id', oid: 23, format: 'binary' },
      { name: 'price', oid: 701, format: 'binary' },
      { name: 'big', oid: 20, format: 'binary' },
      { name: 'at', oid: 1184, format: 'binary', js: 'ms' },
      { name: 'amount', oid: 1700, format: 'text' }, // numeric stays text (exact string)
      { name: 'name', oid: 25, format: 'text' },
    ]
    const ms = Date.UTC(2021, 5, 2, 12, 0, 0, 0)
    const body = wire.dataRow([wire.bin.int4(7), wire.bin.float8(9.99), wire.bin.int8(123n), wire.bin.timestamp(ms), '12345.6789', 'alice'])
    expect(compileRow(cols, 'object', map)(body)).toEqual({ id: 7, price: 9.99, big: 123n, at: ms, amount: '12345.6789', name: 'alice' })
  })
})
