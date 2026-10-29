// The write-through text encoders (bytes straight into the buffer, latin1 for ASCII) must be BYTE-IDENTICAL
// to the string-building versions they replaced: arrayLiteralInto vs lpStr(arrayLiteral), the ISO date path
// vs lpStr(toISOString), and copyRowsText vs the old parts.join('') encoder. Matrix + fast-check.
import { test, expect, describe } from 'bun:test'
import fc from 'fast-check'
import { Writer } from '../../src/protocol.ts'
import { arrayLiteral, arrayLiteralInto, encodeValueInto, copyRowsText } from '../../src/encode.ts'

describe('arrayLiteralInto(w) == w.lpStr(arrayLiteral(arr))', () => {
  const into = (arr: unknown[]) => { const w = new Writer(1 << 16); arrayLiteralInto(w, arr); return Buffer.from(w.slice()) }
  const ref = (arr: unknown[]) => { const w = new Writer(1 << 16); w.lpStr(arrayLiteral(arr)); return Buffer.from(w.slice()) }
  const CASES: unknown[][] = [
    [1, 2, 3], [], [1, null, 3], [[1, 2], [3, 4]], [[['x'], ['y']], [['z']]],
    ['a,b', 'c"d', 'x\\y', ' sp ', 'NULL', ''], [true, false, null],
    [1n, 9223372036854775807n], [1.5, -0.001, 1e21], [NaN, Infinity, -Infinity],
    [new Date('2024-01-15T10:30:45.123Z'), new Date('2000-01-01T00:00:00Z')],
    [Buffer.from('deadbeef', 'hex'), Buffer.from('00ff', 'hex')],
    [{ a: 1 }, { b: [2, 3], c: 'q"x\\y' }], ['café', '日本語', '😀'],
  ]
  CASES.forEach((arr, i) => test(`case ${i}`, () => expect(into(arr).equals(ref(arr))).toBe(true)))
  test('property: random nested arrays', () => {
    const leaf = fc.oneof(fc.integer(), fc.double({ noNaN: true }), fc.boolean(), fc.constant(null), fc.string(), fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }))
    const arr = fc.oneof(fc.array(leaf, { maxLength: 6 }), fc.array(fc.array(leaf, { maxLength: 4 }), { maxLength: 4 }))
    fc.assert(fc.property(arr, (a) => into(a as unknown[]).equals(ref(a as unknown[]))), { numRuns: 3000 })
  })
})

describe('encodeValueInto(Date) writes ISO == lpStr(toISOString)', () => {
  const enc = (v: Date) => { const w = new Writer(64); encodeValueInto(w, v); return Buffer.from(w.slice()) }
  const ref = (v: Date) => { const w = new Writer(64); w.lpStr(v.toISOString()); return Buffer.from(w.slice()) }
  const DATES = [
    new Date('2024-01-15T10:30:45.123Z'), new Date('2024-01-15T10:30:45.000Z'), new Date(0),
    new Date('0001-01-01T00:00:00.000Z'), new Date('0999-12-31T23:59:59.999Z'), new Date('9999-12-31T23:59:59.999Z'),
    new Date('2000-02-29T00:00:00.001Z'), new Date(Date.UTC(0, 0, 1)),
  ]
  DATES.forEach((d, i) => test(`date ${i} = ${d.toISOString()}`, () => expect(enc(d).equals(ref(d))).toBe(true)))
  test('property: random dates 0001-9999', () => {
    fc.assert(fc.property(fc.date({ min: new Date('0001-01-01T00:00:00Z'), max: new Date('9999-12-31T23:59:59.999Z'), noInvalidDate: true }), (d) => enc(d).equals(ref(d))), { numRuns: 3000 })
  })
})

describe('copyRowsText == the old parts.join() string encoder', () => {
  const escCopyText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
  const refCell = (v: unknown): string => {
    if (v == null) return '\\N'
    if (typeof v === 'string') return escCopyText(v)
    if (typeof v === 'number' || typeof v === 'bigint') return String(v)
    if (typeof v === 'boolean') return v ? 't' : 'f'
    if (v instanceof Date) return v.toISOString()
    if (Buffer.isBuffer(v)) return '\\\\x' + v.toString('hex')
    return escCopyText(typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  const ref = (names: string[], rows: unknown[][]) => rows.map((r) => names.map((_, c) => refCell(r[c])).join('\t') + '\n').join('')
  const got = (names: string[], rows: unknown[][], chunk?: number) => Buffer.concat([...copyRowsText(names, rows, chunk)]).toString('utf8')

  test('mixed types + escaping', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f']
    const rows: unknown[][] = [
      [1, 'hello', true, new Date('2024-01-15T10:30:45.123Z'), null, Buffer.from('ff00','hex')],
      [2n, 'tab\there\nnl\\back\rcr', false, new Date(0), { x: 1, y: [2, 3] }, 'café日本語😀'],
      [1.5, '', null, new Date('0050-06-15T12:00:00.000Z'), 'plain', 'quote"only'],
    ]
    expect(got(names, rows)).toBe(ref(names, rows))
  })
  test('chunk boundaries preserved (small chunkBytes -> many yields)', () => {
    const names = ['a']
    const rows: unknown[][] = Array.from({ length: 5000 }, (_, i) => [`row_${i}_${'x'.repeat(40)}`])
    expect(got(names, rows, 4096)).toBe(ref(names, rows))
  })
  test('property: random rows', () => {
    const names = ['a', 'b']
    const cellArb = fc.oneof(fc.integer(), fc.double({ noNaN: true }), fc.boolean(), fc.constant(null), fc.string(), fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }), fc.date({ min: new Date('0001-01-01T00:00:00Z'), max: new Date('9999-12-31T23:59:59.999Z'), noInvalidDate: true }))
    fc.assert(fc.property(fc.array(fc.tuple(cellArb, cellArb), { maxLength: 25 }), (rows) => got(names, rows as unknown[][]) === ref(names, rows as unknown[][])), { numRuns: 2000 })
  })
})
