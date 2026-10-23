// MICRO-OPT exploration for the codegen row builder (src/codegen.ts).
// Goal: measure which generated-source micro-opts actually move the needle, on BOTH engines.
//   node bench/codegen-microopt.bench.ts
//   bun  bench/codegen-microopt.bench.ts
//
// Each variant is compiled ONCE (via new Function) outside the measured fn, so we isolate the
// per-row DECODE cost (comments/strict/manual-read are baked into the compiled fn — removing
// comments cannot affect the hot loop, variant F proves it). Buffers are pre-built in setup;
// the only allocation in bench scope is the result array + row objects, which IS the work.
import { run, bench, group, summary, do_not_optimize } from 'mitata'

const N = 1000

// Fixed realistic shape: int4, text, text, int4, bool, int8(as string). Mix of ints/strings/bool.
const COLS = [
  { name: 'id', kind: 'int' as const },
  { name: 'name', kind: 'str' as const },
  { name: 'email', kind: 'str' as const },
  { name: 'age', kind: 'int' as const },
  { name: 'active', kind: 'bool' as const },
  { name: 'balance', kind: 'str' as const }, // int8 -> exact string
]

// --- build N DataRow bodies: [Int16 colCount][ Int32 len + bytes ]* -------------------------
function buildBody(values: (string | null)[]): Buffer {
  const parts: Buffer[] = []
  const head = Buffer.allocUnsafe(2); head.writeInt16BE(values.length, 0); parts.push(head)
  for (const val of values) {
    if (val === null) { const h = Buffer.allocUnsafe(4); h.writeInt32BE(-1, 0); parts.push(h); continue }
    const v = Buffer.from(val, 'utf8'); const h = Buffer.allocUnsafe(4); h.writeInt32BE(v.length, 0); parts.push(h, v)
  }
  return Buffer.concat(parts)
}
const bodies: Buffer[] = Array.from({ length: N }, (_, r) =>
  buildBody([String(r), 'user_' + r, 'user' + r + '@example.com', String(18 + (r % 60)), r % 2 ? 't' : 'f', String(BigInt(r) * 1000000n)]),
)

const hasUtf8Slice = typeof (Buffer.prototype as unknown as { utf8Slice?: unknown }).utf8Slice === 'function'

// --- source generator: emit `function row(b){...}` for the fixed shape with toggled opts -----
interface Opts { strict: boolean; manualLen: boolean; utf8: boolean; comments: boolean }
function gen(o: Opts): string {
  const ts = (a: string, b: string) => (o.utf8 ? `b.utf8Slice(${a}, ${b})` : `b.toString('utf8', ${a}, ${b})`)
  const lenRead = o.manualLen
    ? 'l = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4;'
    : 'l = b.readInt32BE(o); o += 4;'
  const lines: string[] = []
  COLS.forEach((c, i) => {
    if (o.comments) lines.push(`  // ${JSON.stringify(c.name)} (${c.kind})`)
    lines.push(`  ${lenRead} let v${i} = null;`)
    if (c.kind === 'int') lines.push(`  if (l !== -1) { let p = o, s = false, x = 0; const e = o + l; if (b[p] === 45) { s = true; p++ } for (; p < e; p++) x = x * 10 + (b[p] - 48); v${i} = s ? -x : x; o += l }`)
    else if (c.kind === 'str') lines.push(`  if (l !== -1) { v${i} = ${ts('o', 'o + l')}; o += l }`)
    else lines.push(`  if (l !== -1) { v${i} = b[o] === 116; o += l }`)
  })
  const ret = '  return { ' + COLS.map((c, i) => `${JSON.stringify(c.name)}: v${i}`).join(', ') + ' };'
  const head = o.strict ? '  "use strict";\n' : ''
  return `function row(b) {\n${head}  let o = 2, l;\n${lines.join('\n')}\n${ret}\n}`
}
const compile = (o: Opts) => new Function('return (' + gen(o) + ')')() as (b: Buffer) => Record<string, unknown>

// whole-set mapper: ONE generated fn that takes all bodies, pre-sizes new Array(n), and decodes
// every row in one internal loop (res[i] = {...}). Same decode lines, no per-row call boundary.
function genSet(o: Opts): string {
  const ts = (a: string, b: string) => (o.utf8 ? `b.utf8Slice(${a}, ${b})` : `b.toString('utf8', ${a}, ${b})`)
  const lenRead = o.manualLen
    ? 'l = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4;'
    : 'l = b.readInt32BE(o); o += 4;'
  const lines: string[] = []
  COLS.forEach((c, i) => {
    lines.push(`    ${lenRead} let v${i} = null;`)
    if (c.kind === 'int') lines.push(`    if (l !== -1) { let p = o, s = false, x = 0; const e = o + l; if (b[p] === 45) { s = true; p++ } for (; p < e; p++) x = x * 10 + (b[p] - 48); v${i} = s ? -x : x; o += l }`)
    else if (c.kind === 'str') lines.push(`    if (l !== -1) { v${i} = ${ts('o', 'o + l')}; o += l }`)
    else lines.push(`    if (l !== -1) { v${i} = b[o] === 116; o += l }`)
  })
  const assign = '    res[i] = { ' + COLS.map((c, i) => `${JSON.stringify(c.name)}: v${i}`).join(', ') + ' };'
  const head = o.strict ? '  "use strict";\n' : ''
  return `function rows(arr) {\n${head}  const n = arr.length, res = new Array(n);\n  for (let i = 0; i < n; i++) {\n    const b = arr[i]; let o = 2, l;\n${lines.join('\n')}\n${assign}\n  }\n  return res;\n}`
}
const compileSet = (o: Opts) => new Function('return (' + genSet(o) + ')')() as (arr: Buffer[]) => unknown[]

const A = compile({ strict: false, manualLen: false, utf8: false, comments: true })  // baseline (current)
const B = compile({ strict: true, manualLen: false, utf8: false, comments: true })   // + "use strict"
const C = compile({ strict: false, manualLen: true, utf8: false, comments: true })   // + manual int32 len read
const D = compile({ strict: true, manualLen: true, utf8: false, comments: true })    // strict + manual
const E = compile({ strict: true, manualLen: true, utf8: hasUtf8Slice, comments: true }) // + utf8Slice (if present)
const F = compile({ strict: true, manualLen: true, utf8: false, comments: false })   // strict + manual, NO comments

// sanity: all variants must produce identical rows
const ref = JSON.stringify(A(bodies[0]!))
const ok = [A, B, C, D, E, F].every((f) => JSON.stringify(f(bodies[0]!)) === ref)
console.log('utf8Slice available:', hasUtf8Slice, '| all variants equal:', ok)
if (!ok) { console.error('VARIANT MISMATCH'); process.exit(1) }

const SET = compileSet({ strict: true, manualLen: true, utf8: hasUtf8Slice, comments: false }) // best config, whole-set
// whole-set sanity
const setOk = JSON.stringify(SET(bodies)[0]) === ref && SET(bodies).length === N
console.log('whole-set mapper equal:', setOk)

const decodeAll = (fn: (b: Buffer) => unknown) => () => { const out = new Array(N); for (let i = 0; i < N; i++) out[i] = fn(bodies[i]!); return do_not_optimize(out) }

group(`decode ${N} rows x ${COLS.length} cols (object mode) — source micro-opts`, () => {
  summary(() => {
    bench('A. baseline: readInt32BE + toString + sloppy', decodeAll(A)).gc('inner')
    bench('B. + "use strict"', decodeAll(B)).gc('inner')
    bench('C. + manual int32 len read', decodeAll(C)).gc('inner')
    bench('D. strict + manual len', decodeAll(D)).gc('inner')
    bench(`E. D + utf8Slice (${hasUtf8Slice ? 'active' : 'n/a -> toString'})`, decodeAll(E)).gc('inner')
    bench('F. D, comments stripped (== D at runtime)', decodeAll(F)).gc('inner')
  })
})

group(`per-row builder vs whole-set mapper (${N} rows, best config)`, () => {
  summary(() => {
    bench('per-row: loop calling row(body) + array store', decodeAll(E)).gc('inner')
    bench('whole-set: one rows(bodies) call', () => do_not_optimize(SET(bodies))).gc('inner')
  })
})
await run({ colors: false })
