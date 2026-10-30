// PostGIS types for minipg — a REGISTRY module (`minipg/geometry`), not core: PostGIS is a
// PostgreSQL extension with per-database OIDs, so its types are defineType() entries whose
// markers you use directly in shapes. Core carries no PostGIS knowledge.
//
//   import { geometry, geography, box2d, box3d } from 'minipg/geometry'
//   query(sql, [], { shape: { g: geometry('geojson'), gs: geometry.array('geojson'), b: box2d('xy') } })
//
// Bare usage (geometry()) yields the raw EWKB hex / 'BOX(…)' text (explicit-only parsing).
// Params: encode is out of scope — pass text (EWKB hex / box literal) and cast in SQL.
import { defineType } from './registry.ts'

export function parseBox(s: string): number[] {
  const open = s.indexOf('(')
  const [lo, hi] = s.slice(open + 1, -1).split(',')
  return [...lo!.trim().split(/\s+/), ...hi!.trim().split(/\s+/)].map(Number)
}

// ---- geometry/geography: text is hex-encoded (E)WKB ----------------------------------------

export interface GeoJson { type: string; coordinates?: unknown; geometries?: GeoJson[]; srid?: number }
const GEO_TYPES = ['', 'Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'] as const

/** Parse (E)WKB bytes -> GeoJSON-shaped object. Handles both EWKB dimension flags (PostGIS)
 *  and ISO WKB type offsets (1000=Z, 2000=M, 3000=ZM), nested byte orders, and SRID. */
export function parseWkb(b: Buffer, pos = 0): { geo: GeoJson; end: number } {
  const le = b[pos] === 1
  const u32 = (o: number): number => (le ? b.readUInt32LE(o) : b.readUInt32BE(o))
  const f64 = (o: number): number => (le ? b.readDoubleLE(o) : b.readDoubleBE(o))
  const raw = u32(pos + 1)
  let p = pos + 5
  const hasZflag = (raw & 0x80000000) !== 0, hasMflag = (raw & 0x40000000) !== 0
  const hasSrid = (raw & 0x20000000) !== 0
  const isoBase = (raw & 0x0fffffff) % 1000
  const isoDims = Math.floor((raw & 0x0fffffff) / 1000) // 0, 1(Z), 2(M), 3(ZM)
  const typeId = isoBase
  const dims = 2 + (hasZflag || isoDims === 1 || isoDims === 3 ? 1 : 0) + (hasMflag || isoDims === 2 || isoDims === 3 ? 1 : 0)
  let srid: number | undefined
  if (hasSrid) { srid = u32(p); p += 4 }
  const point = (): number[] => { const c: number[] = []; for (let d = 0; d < dims; d++) { c.push(f64(p)); p += 8 } return c }
  const ring = (): number[][] => { const n = u32(p); p += 4; const out: number[][] = []; for (let i = 0; i < n; i++) out.push(point()); return out }
  const type = GEO_TYPES[typeId]
  if (!type) throw new Error(`minipg: unsupported WKB geometry type ${typeId}`)
  let geo: GeoJson
  switch (type) {
    case 'Point': geo = { type, coordinates: point() }; break
    case 'LineString': geo = { type, coordinates: ring() }; break
    case 'Polygon': { const n = u32(p); p += 4; const rings: number[][][] = []; for (let i = 0; i < n; i++) rings.push(ring()); geo = { type, coordinates: rings }; break }
    default: { // Multi* / GeometryCollection: n nested FULL geometries (each with its own byte-order header)
      const n = u32(p); p += 4
      const parts: GeoJson[] = []
      for (let i = 0; i < n; i++) { const r = parseWkb(b, p); parts.push(r.geo); p = r.end }
      geo = type === 'GeometryCollection'
        ? { type, geometries: parts }
        : { type, coordinates: parts.map((g) => g.coordinates) }
    }
  }
  if (srid !== undefined) geo.srid = srid
  return { geo, end: p }
}
export const parseEwkbHex = (hex: string): GeoJson => parseWkb(Buffer.from(hex, 'hex')).geo

// :xy/:tuple are the DECLARED-POINT contract (drizzle's geometry(point) modes): a non-Point
// value under them throws loudly — same never-silent precedent as numeric:bigint's integer contract.
const ewkbPointCoords = (s: string): number[] => {
  const geo = parseEwkbHex(s)
  if (geo.type !== 'Point') throw new Error(`minipg/geometry: :xy/:tuple expect a Point geometry, got ${geo.type || 'an empty geometry'} — use :geojson for mixed geometry columns`)
  return geo.coordinates as number[]
}
const GEO_TARGETS = {
  geojson: parseEwkbHex,
  wkb: (s: string): Buffer => Buffer.from(s, 'hex'),
  hex: (s: string): string => s, // explicit alias of the bare raw text
  xy: (s: string): { x: number; y: number } => { const c = ewkbPointCoords(s); return { x: c[0]!, y: c[1]! } },
  tuple: ewkbPointCoords, // full coordinate array — XYZ/XYZM points keep their extra dimensions
}
/** PostGIS `geometry`: raw EWKB hex text bare/:hex; GeoJSON-shaped object (:geojson); Buffer (:wkb);
 *  Point-declared columns: {x,y} (:xy) or the coordinate array (:tuple) — non-Point values THROW. */
export const geometry = defineType('geometry', { ascii: true, delim: ':', targets: GEO_TARGETS })
/** PostGIS `geography` — same wire text as geometry. */
export const geography = defineType('geography', { ascii: true, delim: ':', targets: GEO_TARGETS })

const boxTargets = (is3d: boolean) => ({
  tuple: parseBox,
  xy: (s: string): Record<string, number | undefined> => {
    const n = parseBox(s)
    return is3d
      ? { xmin: n[0], ymin: n[1], zmin: n[2], xmax: n[3], ymax: n[4], zmax: n[5] }
      : { xmin: n[0], ymin: n[1], xmax: n[2], ymax: n[3] }
  },
})
/** PostGIS `box2d`: raw 'BOX(…)' text bare; {xmin,ymin,xmax,ymax} (:xy); flat numbers (:tuple). */
export const box2d = defineType('box2d', { ascii: true, targets: boxTargets(false) })
/** PostGIS `box3d`: raw 'BOX3D(…)' text bare; {xmin,…,zmax} (:xy); flat numbers (:tuple). */
export const box3d = defineType('box3d', { ascii: true, targets: boxTargets(true) })
