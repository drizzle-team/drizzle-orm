// COPY row encoders (encode.ts copyRowsBinary / copyRowsText): binary layout + text escaping.
import { test, expect, describe } from 'bun:test'
import { copyRowsBinary, copyRowsText, copyBinarySupported } from '../../src/encode.ts'

const collect = (g: Generator<Buffer>): Buffer => Buffer.concat([...g])

describe('copyRowsBinary', () => {
  test('header, tuple layout, NULL field, trailer', () => {
    const b = collect(copyRowsBinary([23, 25], ['a', 'b'], [[7, 'hi'], [null, 'x']]))
    expect(b.subarray(0, 11)).toEqual(Buffer.from([0x50, 0x47, 0x43, 0x4f, 0x50, 0x59, 0x0a, 0xff, 0x0d, 0x0a, 0x00]))
    expect(b.readInt32BE(11)).toBe(0) // flags
    expect(b.readInt32BE(15)).toBe(0) // extension length
    let off = 19
    expect(b.readInt16BE(off)).toBe(2); off += 2          // row 1: field count
    expect(b.readInt32BE(off)).toBe(4); off += 4
    expect(b.readInt32BE(off)).toBe(7); off += 4          // int4 7
    expect(b.readInt32BE(off)).toBe(2); off += 4
    expect(b.toString('utf8', off, off + 2)).toBe('hi'); off += 2
    expect(b.readInt16BE(off)).toBe(2); off += 2          // row 2
    expect(b.readInt32BE(off)).toBe(-1); off += 4         // NULL
    expect(b.readInt32BE(off)).toBe(1); off += 4
    expect(b.toString('utf8', off, off + 1)).toBe('x'); off += 1
    expect(b.readInt16BE(off)).toBe(-1)                   // trailer
    expect(off + 2).toBe(b.length)
  })

  test('mismatch names row and column; rows can be records', () => {
    expect(() => collect(copyRowsBinary([23], ['n'], [[1], ['bad']]))).toThrow(/row 1, column "n"/)
    const b = collect(copyRowsBinary([23], ['n'], [{ n: 5 }]))
    expect(b.readInt32BE(19 + 2 + 4)).toBe(5)
  })
})

describe('copyRowsText', () => {
  test('escaping, NULLs, type stringification', () => {
    const rows = [
      ['tab\there', 'nl\nline', 'bs\\slash', null],
      [42, true, new Date('2026-01-02T03:04:05.678Z'), Buffer.from([0xbe, 0xef])],
      [{ a: 1 }, 1.5, 'cr\rreturn', 9007199254740993n],
    ]
    const s = collect(copyRowsText(['a', 'b', 'c', 'd'], rows)).toString('utf8')
    expect(s.split('\n').slice(0, -1)).toEqual([
      'tab\\there\tnl\\nline\tbs\\\\slash\t\\N',
      '42\tt\t2026-01-02T03:04:05.678Z\t\\\\xbeef',
      '{"a":1}\t1.5\tcr\\rreturn\t9007199254740993',
    ])
  })
})

describe('copyBinarySupported', () => {
  test('fast set yes; numeric/uuid/json no', () => {
    expect(copyBinarySupported([20, 25, 23, 701, 16, 1184, 21, 1043, 1114])).toBe(true)
    expect(copyBinarySupported([23, 1700])).toBe(false)
    expect(copyBinarySupported([2950])).toBe(false)
  })
})
