// The mapper SEAM: one place the connection asks for a row mapper, given the columns + result mode +
// decoder map. The ONLY difference between the two implementations is how the buffer→POJO mapping is
// assembled — the JIT path compiles a monomorphic per-shape function (new Function, needs eval), the
// interpreted path resolves a per-column CellDecoder[] and loops (no eval). Both call the SAME decode
// strategies (JIT inlines them; interpreted picks them from the catalog in ./decode.ts), so they
// produce identical rows. `decode:'auto'` uses JIT where eval is available, else interpreted.
import type { Decoder } from './types.ts'
import { compileRow, type CodegenCol } from './decode.ts'
import { pickDecoder } from './decode.ts'

export type RowMapper = (body: Buffer) => unknown
export type RowMapperFactory = (cols: CodegenCol[], mode: 'array' | 'object', map: Map<number, Decoder>) => RowMapper

/** Can this runtime compile functions from strings? (false under strict CSP / Cloudflare Workers.) */
export function isEvalAvailable(): boolean { try { new Function('return 1')(); return true } catch { return false } }

const setKey = (obj: Record<string, unknown>, k: string, v: unknown) => { // __proto__ as an own property (no prototype pollution)
  if (k === '__proto__') Object.defineProperty(obj, k, { value: v, writable: true, enumerable: true, configurable: true })
  else obj[k] = v
}
// Collect/Transform assembly tree (built once per mapper; the interpreted mirror of decode2.buildObjectLiteral).
type ONode = { leaves: Array<{ key: string; i: number; xform?: (v: unknown) => unknown; required: boolean }>; groups: Array<{ key: string; node: ONode }>; nullable: boolean }
function buildObjTree(cols: CodegenCol[]): ONode {
  const root: ONode = { leaves: [], groups: [], nullable: false }
  cols.forEach((c, i) => {
    let node = root
    const gn = c.groupNullable ?? []
    ;(c.path ?? []).forEach((seg, depth) => { let g = node.groups.find((x) => x.key === seg); if (!g) { g = { key: seg, node: { leaves: [], groups: [], nullable: gn[depth] ?? false } }; node.groups.push(g) } node = g.node })
    node.leaves.push({ key: c.name, i, xform: c.xform, required: !c.nullable })
  })
  return root
}
function assembleObj(node: ONode, vals: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const l of node.leaves) setKey(obj, l.key, l.xform && vals[l.i] !== null ? l.xform(vals[l.i]) : vals[l.i]) // xform SKIPPED for null (null stays null)
  for (const g of node.groups) setKey(obj, g.key, assembleGroup(g.node, vals))
  return obj
}
function groupAllNull(node: ONode, vals: unknown[]): boolean {
  for (const l of node.leaves) if (vals[l.i] !== null) return false
  for (const g of node.groups) if (!groupAllNull(g.node, vals)) return false
  return true
}
function assembleGroup(node: ONode, vals: unknown[]): Record<string, unknown> | null {
  if (node.nullable) { // CollectNullable: null the whole group on a LEFT-JOIN miss (plain Collect always returns an object)
    let anyRequired = false
    for (const l of node.leaves) { if (l.required) { anyRequired = true; if (vals[l.i] === null) return null } } // a required (non-Nullable) leaf is NULL
    if (!anyRequired && groupAllNull(node, vals)) return null // all-Nullable group, every field null
  }
  return assembleObj(node, vals)
}

// ---- interpreted: resolve a CellDecoder per column once, decode each row in a loop ----
function interpretedMapper(cols: CodegenCol[], mode: 'array' | 'object', map: Map<number, Decoder>): RowMapper {
  const d = cols.map((c) => pickDecoder(c, map))
  const n = d.length
  if (mode === 'object') {
    if (!cols.some((c) => c.path || c.xform)) { // fast flat path — no Collect / Transform
      const names = cols.map((c) => c.name)
      return (b) => {
        let o = 2 // skip the Int16 column count
        const row: Record<string, unknown> = {}
        for (let i = 0; i < n; i++) {
          const l = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!; o += 4
          let v: unknown = null
          if (l !== -1) { v = d[i]!(b, o, l); o += l }
          setKey(row, names[i]!, v)
        }
        return row
      }
    }
    // Collect/Transform: decode into a flat vals[], then assemble the nested object (auto-null groups, xform per leaf)
    const tree = buildObjTree(cols)
    return (b) => {
      let o = 2
      const vals = new Array<unknown>(n)
      for (let i = 0; i < n; i++) { const l = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!; o += 4; if (l === -1) vals[i] = null; else { vals[i] = d[i]!(b, o, l); o += l } }
      return assembleObj(tree, vals)
    }
  }
  return (b) => {
    let o = 2
    const r = new Array(n)
    for (let i = 0; i < n; i++) { const l = (b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!; o += 4; if (l === -1) r[i] = null; else { r[i] = d[i]!(b, o, l); o += l } }
    return r
  }
}

// ---- jit: compile a monomorphic per-shape builder (inlined decode) ----
function jitMapper(cols: CodegenCol[], mode: 'array' | 'object', map: Map<number, Decoder>): RowMapper {
  return compileRow(cols, mode, map)
}

/** Pick the mapper strategy for a `decode` setting. `'jit'` on a no-eval runtime throws (fail fast). */
export function buildMapperFactory(decode: 'auto' | 'jit' | 'interpreted' = 'auto', hasEval = isEvalAvailable()): RowMapperFactory {
  if (decode === 'interpreted') return interpretedMapper
  if (decode === 'jit') { if (!hasEval) throw new Error("minipg: decode:'jit' needs eval (new Function), which this runtime disallows — use decode:'interpreted' or 'auto'"); return jitMapper }
  return hasEval ? jitMapper : interpretedMapper // 'auto'
}
