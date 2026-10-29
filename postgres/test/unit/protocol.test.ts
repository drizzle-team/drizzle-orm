// Pure unit tests for the wire protocol (no database). Byte-exact golden checks
// for the writers, chunk-reassembly + guards for the Parser, and the decoders.
import { test, expect, describe } from 'bun:test'
import { W, Parser, parseRowDescription, parseDataRow } from '../../src/protocol.ts'
import { encodeParam } from '../../src/encode.ts'

const u16 = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(n); return b }
const i32 = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(n); return b }

describe('W.* writers — byte-exact golden', () => {
  test('sync / flush / terminate', () => {
    expect([...W.sync()]).toEqual([0x53, 0, 0, 0, 4])
    expect([...W.flush()]).toEqual([0x48, 0, 0, 0, 4])
    expect([...W.terminate()]).toEqual([0x58, 0, 0, 0, 4])
  })
  test('execute(maxRows=0)', () => {
    expect([...W.execute('', 0)]).toEqual([0x45, 0, 0, 0, 9, 0x00, 0, 0, 0, 0])
  })
  test('describe statement', () => {
    expect([...W.describe('S', '')]).toEqual([0x44, 0, 0, 0, 6, 0x53, 0x00])
  })
  test('password', () => {
    expect([...W.password('x')]).toEqual([0x70, 0, 0, 0, 6, 0x78, 0x00])
  })
  test('sslRequest magic', () => {
    expect([...W.sslRequest()]).toEqual([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f])
  })
  test('startup: self-consistent length + protocol 196608 + pairs', () => {
    const b = W.startup({ user: 'u', database: 'd' })
    expect(b.readInt32BE(0)).toBe(b.length) // length prefix covers itself
    expect(b.readInt32BE(4)).toBe(196608) // protocol 3.0
    expect(b.includes(Buffer.from('user\0u\0'))).toBe(true)
    expect(b.includes(Buffer.from('database\0d\0'))).toBe(true)
    expect(b[b.length - 1]).toBe(0) // final terminator
  })
  test('parse: framed, type P, self-consistent length', () => {
    const b = W.parse('', 'select 1')
    expect(b[0]).toBe(0x50)
    expect(b.readInt32BE(1)).toBe(b.length - 1)
    expect(b.includes(Buffer.from('select 1\0'))).toBe(true)
  })
  test('bind: empty params framed correctly', () => {
    const b = W.bind('', '', [])
    expect(b[0]).toBe(0x42)
    expect(b.readInt32BE(1)).toBe(b.length - 1)
  })
  test('bind: rejects > 65535 params (no RangeError/overflow)', () => {
    const many = new Array(65536).fill({ format: 0, bytes: null })
    expect(() => W.bind('', '', many)).toThrow(/too many bind parameters/)
  })
  test('parse: rejects NUL in SQL', () => {
    expect(() => W.parse('', 'select 1\0; drop')).toThrow(/NUL/)
  })
})

describe('Parser — framing', () => {
  const Z = Buffer.from([0x5a, 0, 0, 0, 5, 0x49]) // ReadyForQuery 'I'

  test('reassembles a message split across chunks', () => {
    const p = new Parser()
    expect(p.push(Z.subarray(0, 3))).toEqual([]) // partial
    const out = p.push(Z.subarray(3))
    expect(out.length).toBe(1)
    expect(out[0]!.type).toBe('Z')
    expect([...out[0]!.body]).toEqual([0x49])
  })
  test('multiple messages in one chunk', () => {
    const p = new Parser()
    const out = p.push(Buffer.concat([Z, Z]))
    expect(out.map((m) => m.type)).toEqual(['Z', 'Z'])
  })
  test('byte-at-a-time still reassembles', () => {
    const p = new Parser()
    let out: ReturnType<Parser['push']> = []
    for (const byte of Z) out = out.concat(p.push(Buffer.from([byte])))
    expect(out.length).toBe(1)
    expect(out[0]!.type).toBe('Z')
  })
  test('empty-body message (len=4) is valid', () => {
    const p = new Parser()
    const out = p.push(Buffer.from([0x31, 0, 0, 0, 4])) // ParseComplete, empty body
    expect(out.length).toBe(1)
    expect(out[0]!.body.length).toBe(0)
  })
  test('negative / sub-minimum length throws (no infinite loop)', () => {
    expect(() => new Parser().push(Buffer.from([0x5a, 0xff, 0xff, 0xff, 0xff]))).toThrow(/invalid backend message length/)
    expect(() => new Parser().push(Buffer.from([0x5a, 0, 0, 0, 3]))).toThrow(/invalid backend message length/)
  })
})

describe('parseRowDescription / parseDataRow', () => {
  test('row description decodes name + oid', () => {
    const body = Buffer.concat([u16(1), Buffer.from('id\0'), i32(0), u16(0), i32(23), u16(4), i32(-1), u16(0)])
    const fields = parseRowDescription(body)
    expect(fields.length).toBe(1)
    expect(fields[0]!.name).toBe('id')
    expect(fields[0]!.dataTypeOid).toBe(23)
  })
  test('data row decodes values and NULL (-1)', () => {
    const body = Buffer.concat([u16(2), i32(3), Buffer.from('abc'), i32(-1)])
    const cells = parseDataRow(body)
    expect(cells[0]?.toString()).toBe('abc')
    expect(cells[1]).toBeNull()
  })
  test('zero-column data row', () => {
    expect(parseDataRow(u16(0))).toEqual([])
  })
})

describe('encodeParam', () => {
  test('null -> SQL NULL', () => expect(encodeParam(null)).toEqual({ format: 0, bytes: null }))
  test('undefined -> SQL NULL', () => expect(encodeParam(undefined)).toEqual({ format: 0, bytes: null }))
  test('Buffer -> binary format', () => {
    const buf = Buffer.from([1, 2, 3])
    expect(encodeParam(buf)).toEqual({ format: 1, bytes: buf })
  })
  test('boolean -> t/f text', () => {
    expect(encodeParam(true).bytes?.toString()).toBe('t')
    expect(encodeParam(false).bytes?.toString()).toBe('f')
  })
  test('Date -> ISO text', () => {
    expect(encodeParam(new Date('2020-01-02T03:04:05.000Z')).bytes?.toString()).toBe('2020-01-02T03:04:05.000Z')
  })
  test('object -> JSON text', () => {
    expect(encodeParam({ a: 1 }).bytes?.toString()).toBe('{"a":1}')
  })
  test('number -> text', () => expect(encodeParam(42).bytes?.toString()).toBe('42'))
  test('NUL byte in string -> throws', () => {
    expect(() => encodeParam('a\0b')).toThrow(/NUL/)
  })
})
