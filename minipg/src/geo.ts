// Geometric + extension type decoders for shapes: built-in `point`/`line` and pgvector, plus
// PostGIS `geometry`/`geography` (EWKB). Extension types have DYNAMIC OIDs (created per
// database), so shapes reference them by NAME via sentinel OIDs — the decoder is chosen by the
// declaration, never by the runtime OID. All are TEXT-wire-format decoders.
import type { CodegenCol } from './decode.ts'

export const OID_POINT = 600
export const OID_LINE = 628    // built-in `line`: text is '{A,B,C}' (Ax + By + C = 0)
export const EXT_VECTOR = -1000   // pgvector `vector` — sentinel (real OID is per-database)
export const EXT_HALFVEC = -1002   // pgvector `halfvec` (same text format as vector)
export const EXT_SPARSEVEC = -1003 // pgvector `sparsevec`: '{i:v,i:v}/dim' (1-based indices)

// ---- point: text is "(x,y)" --------------------------------------------------------------
export const parsePoint = (s: string): { x: number; y: number } => {
  const c = s.indexOf(',')
  return { x: Number(s.slice(1, c)), y: Number(s.slice(c + 1, -1)) }
}
export const parsePointTuple = (s: string): [number, number] => {
  const c = s.indexOf(',')
  return [Number(s.slice(1, c)), Number(s.slice(c + 1, -1))]
}

// ---- line: text is "{A,B,C}" (coefficients of Ax + By + C = 0) ------------------------------
export const parseLineAbc = (s: string): { a: number; b: number; c: number } => {
  const c1 = s.indexOf(','), c2 = s.indexOf(',', c1 + 1)
  return { a: Number(s.slice(1, c1)), b: Number(s.slice(c1 + 1, c2)), c: Number(s.slice(c2 + 1, -1)) }
}
export const parseLineTuple = (s: string): [number, number, number] => {
  const c1 = s.indexOf(','), c2 = s.indexOf(',', c1 + 1)
  return [Number(s.slice(1, c1)), Number(s.slice(c1 + 1, c2)), Number(s.slice(c2 + 1, -1))]
}

// ---- vector: text is "[1,2.5,3]" (valid JSON) ----------------------------------------------
export const parseVector = (s: string): number[] => JSON.parse(s) as number[]

// ---- sparsevec: text is '{1:1.5,3:2}/5' (1-based indices / dimension) -----------------------
export interface SparseVec { dim: number; indices: number[]; values: number[] }
export function parseSparsevec(s: string): SparseVec {
  const slash = s.lastIndexOf('/')
  const dim = Number(s.slice(slash + 1))
  const body = s.slice(1, slash - 1) // strip '{' and '}'
  const indices: number[] = [], values: number[] = []
  if (body.length) for (const pair of body.split(',')) {
    const c = pair.indexOf(':')
    indices.push(Number(pair.slice(0, c)))
    values.push(Number(pair.slice(c + 1)))
  }
  return { dim, indices, values }
}
export function sparseToDense(v: SparseVec): number[] {
  const out = new Array<number>(v.dim).fill(0)
  for (let i = 0; i < v.indices.length; i++) out[v.indices[i]! - 1] = v.values[i]! // 1-based
  return out
}

// ---- box2d/box3d: 'BOX(xmin ymin,xmax ymax)' / 'BOX3D(xmin ymin zmin,xmax ymax zmax)' -------
// ---- shape-column dispatcher (shared by BOTH decode engines) --------------------------------
type AtDecoder = (b: Buffer, o: number, l: number) => unknown

/** Decoder for a geometric/extension shape column. Claims ONLY explicit parse targets — bare
 *  declarations ('point', 'vector', 'geometry') default to the raw TEXT string via the normal
 *  string machinery (returning null here). Parsing is opt-in per column. */
export function extAt(col: Pick<CodegenCol, 'oid' | 'js'>): AtDecoder | null {
  const js = col.js as string | undefined
  switch (col.oid) {
    case OID_POINT:
      if (js === 'xy') return (b, o, l) => parsePoint(b.toString('utf8', o, o + l))
      if (js === 'tuple') return (b, o, l) => parsePointTuple(b.toString('utf8', o, o + l))
      return null // bare / :string -> raw '(x,y)' text
    case OID_LINE:
      if (js === 'abc') return (b, o, l) => parseLineAbc(b.toString('utf8', o, o + l))
      if (js === 'tuple') return (b, o, l) => parseLineTuple(b.toString('utf8', o, o + l))
      return null // bare / :string -> raw '{A,B,C}' text
    case EXT_VECTOR:
      if (js === 'array') return (b, o, l) => parseVector(b.toString('utf8', o, o + l))
      if (js === 'f32') return (b, o, l) => Float32Array.from(JSON.parse(b.toString('utf8', o, o + l)) as number[])
      return null // bare / :string -> raw '[…]' text
    case EXT_HALFVEC: // same '[…]' text as vector
      if (js === 'array') return (b, o, l) => parseVector(b.toString('utf8', o, o + l))
      if (js === 'f32') return (b, o, l) => Float32Array.from(JSON.parse(b.toString('utf8', o, o + l)) as number[])
      return null
    case EXT_SPARSEVEC:
      if (js === 'sparse') return (b, o, l) => parseSparsevec(b.toString('utf8', o, o + l))
      if (js === 'array') return (b, o, l) => sparseToDense(parseSparsevec(b.toString('utf8', o, o + l)))
      return null // bare / :string -> raw '{i:v,…}/dim' text
    default: return null
  }
}

/** String-leaf for one geo/extension ARRAY ELEMENT ('{…}' array literals carry element TEXT) —
 *  mirrors extAt's target mapping exactly. null = target not parseable for this type (bare/raw). */
export function extLeafFor(elem: number, js?: string): ((s: string) => unknown) | null {
  switch (elem) {
    case OID_POINT: return js === 'xy' ? parsePoint : js === 'tuple' ? parsePointTuple : null
    case OID_LINE: return js === 'abc' ? parseLineAbc : js === 'tuple' ? parseLineTuple : null
    case EXT_VECTOR: case EXT_HALFVEC:
      return js === 'array' ? parseVector : js === 'f32' ? (s) => Float32Array.from(JSON.parse(s) as number[]) : null
    case EXT_SPARSEVEC: return js === 'sparse' ? parseSparsevec : js === 'array' ? (s) => sparseToDense(parseSparsevec(s)) : null
    default: return null
  }
}
