// Verifies MiniBuffer (the edge/browser Buffer polyfill) is byte-for-byte faithful to native Buffer
// across exactly the surface the driver uses. Run under Node/Bun where BOTH exist, comparing outputs.
import { test, expect, describe } from 'bun:test'
import { MiniBuffer } from '../../src/buffer-polyfill.ts'

const bytesEqual = (a: Uint8Array, b: Uint8Array) => { expect([...a]).toEqual([...b]) }

describe('MiniBuffer.from parity', () => {
  test('utf8 / hex / latin1 strings', () => {
    for (const s of ['café 😀 €', 'plain', '']) bytesEqual(MiniBuffer.from(s), Buffer.from(s))
    bytesEqual(MiniBuffer.from('deadbeef00ff', 'hex'), Buffer.from('deadbeef00ff', 'hex'))
    bytesEqual(MiniBuffer.from('\x00\x7f\xff\xa9', 'latin1'), Buffer.from('\x00\x7f\xff\xa9', 'latin1'))
  })
  test('ArrayBuffer view (no copy) matches Buffer.from(ab, off, len)', () => {
    const ab = new Uint8Array([9, 8, 7, 6, 5, 4]).buffer
    bytesEqual(MiniBuffer.from(ab, 2, 3), Buffer.from(ab, 2, 3))
    const mb = MiniBuffer.from(ab, 0, 6); mb[0] = 42 // view: mutation writes through to ab
    expect(new Uint8Array(ab)[0]).toBe(42)
  })
  test('from Uint8Array copies', () => {
    const src = new Uint8Array([1, 2, 3]); const mb = MiniBuffer.from(src); mb[0] = 99
    expect(src[0]).toBe(1) // copy, not view
  })
})

describe('MiniBuffer big-endian reads match Buffer', () => {
  // a native buffer with crafted + patterned bytes, then a MiniBuffer over identical bytes
  const nat = Buffer.alloc(24)
  nat.writeInt32BE(-123456, 0); nat.writeUInt32BE(0xdeadbeef, 4); nat.writeInt16BE(-4242, 8)
  nat.writeFloatBE(Math.fround(3.14159), 10); nat.writeDoubleBE(Math.PI, 14)
  const mb = MiniBuffer.from(nat)
  test.each([['readInt16BE', 8], ['readUInt16BE', 8], ['readInt32BE', 0], ['readUInt32BE', 4], ['readFloatBE', 10], ['readDoubleBE', 14]] as const)(
    '%s @ %i', (m, off) => { expect((mb as any)[m](off)).toBe((nat as any)[m](off)) },
  )
  test('readBigInt64BE', () => {
    const n = Buffer.alloc(8); n.writeBigInt64BE(9223372036854775807n, 0)
    expect(MiniBuffer.from(n).readBigInt64BE(0)).toBe(n.readBigInt64BE(0))
  })
})

describe('MiniBuffer writes match Buffer', () => {
  test('each write* produces identical bytes and return offset', () => {
    const size = 40
    const mb = MiniBuffer.alloc(size), nat = Buffer.alloc(size)
    const ops: Array<[string, unknown, number]> = [
      ['writeUInt8', 200, 0], ['writeInt16BE', -1000, 1], ['writeUInt16BE', 60000, 3], ['writeInt32BE', -70000, 5],
      ['writeUInt32BE', 0xcafebabe, 9], ['writeFloatBE', Math.fround(2.5), 13], ['writeDoubleBE', 1e-300, 17], ['writeBigInt64BE', -42n, 25],
    ]
    for (const [m, v, off] of ops) {
      const rMb = (mb as any)[m](v, off), rNat = (nat as any)[m](v, off)
      expect(rMb).toBe(rNat) // Buffer write* returns the next offset
    }
    bytesEqual(mb, nat)
  })
})

describe('MiniBuffer misc', () => {
  test('toString utf8/hex/latin1 with ranges', () => {
    const nat = Buffer.from('héllo wörld', 'utf8'); const mb = MiniBuffer.from(nat)
    expect(mb.toString()).toBe(nat.toString())
    expect(mb.toString('utf8', 1, 5)).toBe(nat.toString('utf8', 1, 5))
    expect(mb.toString('hex')).toBe(nat.toString('hex'))
    expect(mb.toString('latin1')).toBe(nat.toString('latin1'))
  })
  test('copy / concat / isBuffer / byteLength / indexOf / subarray', () => {
    const a = MiniBuffer.from([1, 2, 3, 4]); const target = MiniBuffer.alloc(4)
    a.copy(target, 1, 0, 3); bytesEqual(target, Buffer.from([0, 1, 2, 3]))
    bytesEqual(MiniBuffer.concat([MiniBuffer.from([1, 2]), MiniBuffer.from([3])]), Buffer.from([1, 2, 3]))
    expect(MiniBuffer.isBuffer(a)).toBe(true); expect(MiniBuffer.isBuffer(new Uint8Array(2))).toBe(false)
    expect(MiniBuffer.byteLength('café 😀')).toBe(Buffer.byteLength('café 😀'))
    expect(MiniBuffer.from([5, 0, 7]).indexOf(0)).toBe(1) // cstring scan (inherited)
    const sub = MiniBuffer.from([0, 0, 1, 44]).subarray(2) // returns MiniBuffer w/ read methods
    expect(sub).toBeInstanceOf(MiniBuffer); expect(sub.readInt16BE(0)).toBe(300)
  })
})
