// JSON-column decode benchmark (mitata). Static groups, static benches.
// EVERYTHING is prepared at module scope — the timed fns do decode only, no buffer/string prep.
//   - JSON.parse / reviver get pre-made strings (the toString is done in setup, not timed)
//   - parseJsonBuffer gets pre-made cell Buffers
//   - Shape scanner gets pre-made DataRow bodies
// Each bench decodes the whole result set into an array (symmetric allocations), one
// do_not_optimize per call, with inner_gc so mitata reports GC time + heap/iter.
//   bun bench/json-decode.bench.ts   (or: bun run bench:json)
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { Shape, Json, JsonArray } from '../src/index.ts'
import { parseJsonBuffer } from '../src/jsonparse.ts'

const a = '{"big": 12312312312312312}'

const reviver = (_k: string, v: unknown, ctx?: { source?: string }) =>
  typeof v === 'number' && Number.isInteger(v) && !Number.isSafeInteger(v) && ctx && typeof ctx.source === 'string' && /^-?\d+$/.test(ctx.source) ? ctx.source : v

// ---- input builders (used only at module scope to prepare data) ----
const body = (json: string) => { const j = Buffer.from(json, 'utf8'); const b = Buffer.allocUnsafe(6 + j.length); b.writeUInt16BE(1, 0); b.writeInt32BE(j.length, 2); j.copy(b, 6); return b }
const bodies = (json: string, n: number) => Array.from({ length: n }, () => body(json))
const cells = (json: string, n: number) => Array.from({ length: n }, () => Buffer.from(json, 'utf8'))
const strs = (json: string, n: number) => Array.from({ length: n }, () => json)

// ---- static decode helpers (operate on already-prepared inputs) ----
const dLossy = (s: string[]) => { const o = new Array(s.length); for (let i = 0; i < s.length; i++) o[i] = JSON.parse(s[i]!); return o }
const dReviver = (s: string[]) => { const o = new Array(s.length); for (let i = 0; i < s.length; i++) o[i] = JSON.parse(s[i]!, reviver as never); return o }
const dBuffer = (c: Buffer[]) => { const o = new Array(c.length); for (let i = 0; i < c.length; i++) o[i] = parseJsonBuffer(c[i]!, 0, c[i]!.length, 'string'); return o }

// =================== scenario A: single object per row (2 bigints, 128 B) ===================
const objJson = '{"id":9007199254740993,"plan":"pro","active":true,"price":19.99,"seats":42,"owner":9007199254740994,"ts":"2024-01-01T00:00:00Z"}'
const objShape = Shape({ sub: Json({ id: 'int8', plan: 'text', active: 'bool', price: 'numeric', seats: 'int4', owner: 'int8', ts: 'timestamptz' }) })
const A_s1 = strs(objJson, 1), A_c1 = cells(objJson, 1), A_b1 = bodies(objJson, 1)
const A_s50 = strs(objJson, 50), A_c50 = cells(objJson, 50), A_b50 = bodies(objJson, 50)
const A_s150 = strs(objJson, 150), A_c150 = cells(objJson, 150), A_b150 = bodies(objJson, 150)

group('object · 1 row', () => {
  summary(() => {
    bench('JSON.parse [lossy]', () => do_not_optimize(dLossy(A_s1))).gc('inner')
    bench('JSON.parse + reviver', () => do_not_optimize(dReviver(A_s1))).gc('inner')
    bench('parseJsonBuffer', () => do_not_optimize(dBuffer(A_c1))).gc('inner')
    bench('Shape scanner', () => do_not_optimize(objShape(A_b1))).gc('inner')
  })
})
group('object · 50 rows', () => {
  summary(() => {
    bench('JSON.parse [lossy]', () => do_not_optimize(dLossy(A_s50))).gc('inner')
    bench('JSON.parse + reviver', () => do_not_optimize(dReviver(A_s50))).gc('inner')
    bench('parseJsonBuffer', () => do_not_optimize(dBuffer(A_c50))).gc('inner')
    bench('Shape scanner', () => do_not_optimize(objShape(A_b50))).gc('inner')
  })
})
group('object · 150 rows', () => {
  summary(() => {
    bench('JSON.parse [lossy]', () => do_not_optimize(dLossy(A_s150))).gc('inner')
    bench('JSON.parse + reviver', () => do_not_optimize(dReviver(A_s150))).gc('inner')
    bench('parseJsonBuffer', () => do_not_optimize(dBuffer(A_c150))).gc('inner')
    bench('Shape scanner', () => do_not_optimize(objShape(A_b150))).gc('inner')
  })
})

// =================== scenario B: array of 10 objects per row (json_agg, 404 B) ===================
const arrJson = '[' + Array.from({ length: 10 }, (_, i) => `{"id":${9007199254740990 + i},"n":"x${i}","v":${i * 1.5}}`).join(',') + ']'
const arrShape = Shape({ invoices: JsonArray({ id: 'int8', n: 'text', v: 'float8' }) })
const B_s1 = strs(arrJson, 1), B_c1 = cells(arrJson, 1), B_b1 = bodies(arrJson, 1)
const B_s50 = strs(arrJson, 50), B_c50 = cells(arrJson, 50), B_b50 = bodies(arrJson, 50)
const B_s150 = strs(arrJson, 150), B_c150 = cells(arrJson, 150), B_b150 = bodies(arrJson, 150)

group('array · 1 row', () => {
  summary(() => {
    bench('JSON.parse [lossy]', () => do_not_optimize(dLossy(B_s1))).gc('inner')
    bench('JSON.parse + reviver', () => do_not_optimize(dReviver(B_s1))).gc('inner')
    bench('parseJsonBuffer', () => do_not_optimize(dBuffer(B_c1))).gc('inner')
    bench('Shape scanner', () => do_not_optimize(arrShape(B_b1))).gc('inner')
  })
})
group('array · 50 rows', () => {
  summary(() => {
    bench('JSON.parse [lossy]', () => do_not_optimize(dLossy(B_s50))).gc('inner')
    bench('JSON.parse + reviver', () => do_not_optimize(dReviver(B_s50))).gc('inner')
    bench('parseJsonBuffer', () => do_not_optimize(dBuffer(B_c50))).gc('inner')
    bench('Shape scanner', () => do_not_optimize(arrShape(B_b50))).gc('inner')
  })
})
group('array · 150 rows', () => {
  summary(() => {
    bench('JSON.parse [lossy]', () => do_not_optimize(dLossy(B_s150))).gc('inner')
    bench('JSON.parse + reviver', () => do_not_optimize(dReviver(B_s150))).gc('inner')
    bench('parseJsonBuffer', () => do_not_optimize(dBuffer(B_c150))).gc('inner')
    bench('Shape scanner', () => do_not_optimize(arrShape(B_b150))).gc('inner')
  })
})

// print mitata's native output
await run()
