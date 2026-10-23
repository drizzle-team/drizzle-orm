// WKB/EWKB parser + point/vector text parsers (src/geo.ts).
import { test, expect, describe } from 'bun:test'
import { parsePoint, parseVector, parseSparsevec, sparseToDense } from '../../src/geo.ts'
import { parseWkb, parseEwkbHex, parseBox } from '../../src/geometry.ts'

// little WKB builder so fixtures are constructed, not hand-typed
class B {
  bytes: number[] = []
  u8(v: number): this { this.bytes.push(v); return this }
  u32(v: number): this { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(v); this.bytes.push(...b); return this }
  f64(v: number): this { const b = Buffer.allocUnsafe(8); b.writeDoubleLE(v); this.bytes.push(...b); return this }
  buf(): Buffer { return Buffer.from(this.bytes) }
}
const point = (x: number, y: number, opts: { srid?: number; z?: number } = {}): B => {
  const b = new B().u8(1)
  let type = 1
  if (opts.z !== undefined) type |= 0x80000000
  if (opts.srid !== undefined) type |= 0x20000000
  b.u32(type >>> 0)
  if (opts.srid !== undefined) b.u32(opts.srid)
  b.f64(x).f64(y)
  if (opts.z !== undefined) b.f64(opts.z)
  return b
}

describe('parseWkb', () => {
  test('Point with SRID (EWKB)', () => {
    expect(parseWkb(point(1, 2, { srid: 4326 }).buf()).geo).toEqual({ type: 'Point', coordinates: [1, 2], srid: 4326 })
  })
  test('Point Z (EWKB flag)', () => {
    expect(parseWkb(point(1, 2, { z: 3 }).buf()).geo).toEqual({ type: 'Point', coordinates: [1, 2, 3] })
  })
  test('Point Z (ISO type offset 1001)', () => {
    const b = new B().u8(1).u32(1001).f64(4).f64(5).f64(6).buf()
    expect(parseWkb(b).geo).toEqual({ type: 'Point', coordinates: [4, 5, 6] })
  })
  test('big-endian Point', () => {
    const b = Buffer.alloc(21)
    b[0] = 0; b.writeUInt32BE(1, 1); b.writeDoubleBE(7, 5); b.writeDoubleBE(8, 13)
    expect(parseWkb(b).geo).toEqual({ type: 'Point', coordinates: [7, 8] })
  })
  test('LineString', () => {
    const b = new B().u8(1).u32(2).u32(2).f64(0).f64(0).f64(1).f64(1).buf()
    expect(parseWkb(b).geo).toEqual({ type: 'LineString', coordinates: [[0, 0], [1, 1]] })
  })
  test('Polygon (one ring)', () => {
    const b = new B().u8(1).u32(3).u32(1).u32(4).f64(0).f64(0).f64(4).f64(0).f64(4).f64(4).f64(0).f64(0).buf()
    expect(parseWkb(b).geo).toEqual({ type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 0]]] })
  })
  test('MultiPoint + GeometryCollection (nested headers)', () => {
    const p1 = point(1, 2).buf(), p2 = point(3, 4).buf()
    const mp = Buffer.concat([new B().u8(1).u32(4).u32(2).buf(), p1, p2])
    expect(parseWkb(mp).geo).toEqual({ type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] })
    const gc = Buffer.concat([new B().u8(1).u32(7).u32(1).buf(), p1])
    expect(parseWkb(gc).geo).toEqual({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }] })
  })
  test('hex entrypoint matches the classic POINT(1 2) SRID=4326 fixture', () => {
    expect(parseEwkbHex('0101000020E6100000000000000000F03F0000000000000040')).toEqual({ type: 'Point', coordinates: [1, 2], srid: 4326 })
  })
})

describe('sparsevec + boxes', () => {
  test('parseSparsevec + dense expansion (1-based indices)', () => {
    expect(parseSparsevec('{1:1.5,3:2}/5')).toEqual({ dim: 5, indices: [1, 3], values: [1.5, 2] })
    expect(sparseToDense(parseSparsevec('{1:1.5,3:2}/5'))).toEqual([1.5, 0, 2, 0, 0])
    expect(parseSparsevec('{}/4')).toEqual({ dim: 4, indices: [], values: [] })
    expect(sparseToDense(parseSparsevec('{}/2'))).toEqual([0, 0])
  })
  test('parseBox 2d + 3d + negatives', () => {
    expect(parseBox('BOX(1 2,3 4)')).toEqual([1, 2, 3, 4])
    expect(parseBox('BOX3D(-1 2.5 0,4 5 6)')).toEqual([-1, 2.5, 0, 4, 5, 6])
  })
})

describe('text parsers', () => {
  test('parsePoint handles negatives + scientific notation', () => {
    expect(parsePoint('(1.5,2.5)')).toEqual({ x: 1.5, y: 2.5 })
    expect(parsePoint('(-3,1e2)')).toEqual({ x: -3, y: 100 })
  })
  test('parseVector', () => {
    expect(parseVector('[1,2.5,-3]')).toEqual([1, 2.5, -3])
  })
})

describe('line parsers', () => {
  const { parseLineAbc, parseLineTuple } = require('../../src/geo.ts') as typeof import('../../src/geo.ts')
  test('abc / tuple, negatives, floats, exponents', () => {
    expect(parseLineAbc('{1,-2,3.5}')).toEqual({ a: 1, b: -2, c: 3.5 })
    expect(parseLineTuple('{1,-2,3.5}')).toEqual([1, -2, 3.5])
    expect(parseLineAbc('{1e-3,-2.5e2,0}')).toEqual({ a: 0.001, b: -250, c: 0 })
    expect(parseLineTuple('{0,1,-7}')).toEqual([0, 1, -7])
  })
})
