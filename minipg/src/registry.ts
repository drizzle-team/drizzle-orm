// User-extensible type registry: defineType() declares a NAME-KEYED custom type with decode
// targets, usable anywhere a TypeSpec goes (top-level shape columns, array elements, Collect
// fields). Name-keyed because extension OIDs are per-database — the marker carries everything,
// so decode needs no OID, no connection config, no catalog lookup. Bare usage (no target)
// yields the raw TEXT string (the explicit-only rule shared with point/vector/geometry).
//
//   const line3d = defineType('line3d', { ascii: true, targets: { abc: (t) => parse(t) } })
//   query(sql, [], { shape: { l: line3d('abc'), ls: line3d.array('abc') } })
//
// `targets` receive the cell as a STRING (the driver slices once — latin1 when `ascii: true`,
// else utf8); `rawTargets` receive the internal zero-copy (buffer, offset, length) form for
// hex→bytes conversions and future binary formats. Encode is out of scope v1: pass params as
// text literals (cast in SQL, e.g. `$1::geometry`).

/** Cell decoders in the driver's internal zero-copy form. */
export type RawCell = (b: Buffer, o: number, l: number) => unknown

export interface CustomTypeDef {
  readonly name: string
  readonly oid: number // allocated sentinel (negative) — the col/cache identity for this def
  readonly ascii: boolean
  readonly delim: string // PG's per-type typdelim: how ITS array literals separate elements
  readonly targets: Record<string, (text: string) => unknown>
  readonly rawTargets: Record<string, RawCell>
}

export interface CustomMarker {
  readonly __customType: CustomTypeDef
  readonly target?: string
  readonly isArray?: boolean
}

export const isCustomMarker = (x: unknown): x is CustomMarker =>
  typeof x === 'object' && x !== null && typeof (x as { __customType?: unknown }).__customType === 'object'

/** A defineType() handle: call it for a scalar column marker, `.array()` for an array column. */
export interface CustomType<T extends string> {
  (target?: T): CustomMarker
  array(target?: T): CustomMarker
  readonly def: CustomTypeDef
}

// Sentinel OIDs for registry types: -2000 and down (geo.ts's hardcoded sentinels own -1000..-1999).
let nextCustomOid = -2000
const DEFS = new Map<number, CustomTypeDef>() // sentinel oid -> def (array elements resolve through this)

export function defineType<K extends string = never, R extends string = never>(
  name: string,
  spec: { ascii?: boolean; delim?: string; targets?: Record<K, (text: string) => unknown>; rawTargets?: Record<R, RawCell> },
): CustomType<K | R> {
  // PG stores typdelim as a single char; a longer one would silently mis-split every array literal.
  if (spec.delim !== undefined && spec.delim.length !== 1) throw new Error(`minipg: type "${name}" delim must be a single character, got ${JSON.stringify(spec.delim)}`)
  const def: CustomTypeDef = {
    name, oid: nextCustomOid--, ascii: spec.ascii === true, delim: spec.delim ?? ',',
    targets: (spec.targets ?? {}) as CustomTypeDef['targets'],
    rawTargets: (spec.rawTargets ?? {}) as CustomTypeDef['rawTargets'],
  }
  DEFS.set(def.oid, def)
  const check = (target?: string): void => {
    if (target !== undefined && !(target in def.targets) && !(target in def.rawTargets)) {
      throw new Error(`minipg: type "${name}" has no target ${JSON.stringify(target)} (known: ${[...Object.keys(def.targets), ...Object.keys(def.rawTargets)].join(', ') || 'none — bare raw text only'})`)
    }
  }
  const handle = ((target?: string): CustomMarker => { check(target); return { __customType: def, target } }) as CustomType<K | R>
  ;(handle as { array: unknown }).array = (target?: string): CustomMarker => { check(target); return { __customType: def, target, isArray: true } }
  ;(handle as { def: CustomTypeDef }).def = def
  return handle
}

// the one unavoidable slice, encoding chosen by the def's ascii hint
type Sliceable = Buffer & { utf8Slice(s: number, e: number): string; latin1Slice(s: number, e: number): string }
const HAS_U8 = typeof Buffer !== 'undefined' && typeof (Buffer.prototype as Partial<Sliceable>).utf8Slice === 'function'
const HAS_L1 = typeof Buffer !== 'undefined' && typeof (Buffer.prototype as Partial<Sliceable>).latin1Slice === 'function'
const sliceUtf8 = HAS_U8 ? (b: Buffer, o: number, l: number) => (b as Sliceable).utf8Slice(o, o + l) : (b: Buffer, o: number, l: number) => b.toString('utf8', o, o + l)
const sliceLat1 = HAS_L1 ? (b: Buffer, o: number, l: number) => (b as Sliceable).latin1Slice(o, o + l) : (b: Buffer, o: number, l: number) => b.toString('latin1', o, o + l)

/** Zero-copy cell decoder for a registry column (sentinel oid + target in col.js), or null when
 *  the oid isn't a registry sentinel. Bare/unknown target -> the raw text string. */
export function customAt(col: { oid: number; js?: string; array?: unknown }): RawCell | null {
  if (col.array) return null // array columns decode per-ELEMENT via customLeafFor, never as one scalar cell
  const def = DEFS.get(col.oid)
  if (!def) return null
  const t = col.js
  if (t !== undefined) {
    const raw = def.rawTargets[t]
    if (raw) return raw
    const fn = def.targets[t]
    if (fn) { const slice = def.ascii ? sliceLat1 : sliceUtf8; return (b, o, l) => fn(slice(b, o, l)) }
  }
  const slice = def.ascii ? sliceLat1 : sliceUtf8
  return (b, o, l) => slice(b, o, l) // bare = raw text
}

/** Element delimiter for a registry ARRAY, or undefined when the oid isn't a registry sentinel.
 *  Fixed per type by its CREATE TYPE (PostGIS pins ':' for geometry/geography), so it's declared,
 *  not discovered — RowDescription never carries typdelim. */
export const customDelimFor = (elem: number): string | undefined => DEFS.get(elem)?.delim

/** String-leaf for a registry ARRAY ELEMENT (array literals carry element text), or null. */
export function customLeafFor(elem: number, target?: string): ((s: string) => unknown) | null {
  const def = DEFS.get(elem)
  if (!def) return null
  if (target !== undefined) {
    const fn = def.targets[target]
    if (fn) return fn
    const raw = def.rawTargets[target]
    if (raw) return (s) => { const b = Buffer.from(s, def.ascii ? 'latin1' : 'utf8'); return raw(b, 0, b.length) }
  }
  return (s) => s // bare = raw element text
}
