// Isolated values[] -> socket bench: JUST the param-encode + Bind serialization + flush +
// socket-write path, no Postgres on the other end (a discard unix-socket server).
//
//   bun playground/bind-encode/bench.ts
//
// Variants:
//   current        src codec.ts encodeParam (map -> EncodedParam[]) + src protocol.ts writeBind
//   direct-text    playground write-through encoder, TEXT params (byte-identical to current)
//   direct-binary  playground write-through encoder, BINARY params via per-column plan
// Both writers are pre-sized (2MB) so buffer-doubling noise doesn't pollute the comparison.
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { Writer, writeBind, writeBindWith, writeExecute, writeSync } from '../../src/protocol.ts'
import { encodeParam, encodeValueInto, compileParamPlan } from '../../src/encode.ts'
import { BindWriter, bindDirectText, bindDirectBinary, writeExecSync, BIN_PLAN, STMT } from './bind-direct.ts'

// ---------- workload: same 6-col insert row as playground/inserts ----------
const BASE = Date.UTC(2026, 0, 1)
const N = 10_000
const PARAMS: unknown[][] = new Array(N)
for (let i = 0; i < N; i++) {
  PARAMS[i] = [
    i + 1,                                                  // id      int8
    `name_${i}_${(i * 2654435761 % 100000).toString(36)}`,  // name    text
    i % 1000,                                               // qty     int4
    (i % 90000) + 0.25,                                     // price   float8
    i % 2 === 0,                                            // flag    bool
    new Date(BASE + (i % 86400) * 1000),                    // created timestamptz
  ]
}

const wCur = new Writer(1 << 21)
const wTxt = new BindWriter(1 << 21)
const wBin = new BindWriter(1 << 21)

function currentRow(w: Writer, values: unknown[]): void {
  const enc = values.map(encodeParam)               // [A] array + N wrappers + N strings + N Buffers
  writeBind(w, '', STMT, enc, 0)                    // [C] copy each param buffer into outbuf
  writeExecute(w, '', 0); writeSync(w)
}
function directTextRow(w: BindWriter, values: unknown[]): void {
  bindDirectText(w, STMT, values); writeExecSync(w) // value -> outbuf, one pass
}
function directBinaryRow(w: BindWriter, values: unknown[]): void {
  bindDirectBinary(w, STMT, values, BIN_PLAN); writeExecSync(w)
}

// the SHIPPED src path (what serializeTask now runs): write-through text, and the compiled
// binary plan used on prepared reuse / declared paramTypes
const wSrcT = new Writer(1 << 21)
const wSrcB = new Writer(1 << 21)
const SRC_PLAN = compileParamPlan([20, 25, 23, 701, 16, 1184])! // int8,text,int4,float8,bool,timestamptz
function srcTextRow(w: Writer, values: unknown[]): void {
  writeBindWith(w, '', STMT, values, encodeValueInto, 0); writeExecute(w, '', 0); writeSync(w)
}
function srcBinaryRow(w: Writer, values: unknown[]): void {
  writeBindWith(w, '', STMT, values, SRC_PLAN, 0); writeExecute(w, '', 0); writeSync(w)
}

// ---------- startup: prove direct-text emits byte-identical wire bytes ----------
{
  wCur.reset(); wTxt.reset(); wSrcT.reset()
  for (const p of PARAMS.slice(0, 50)) { currentRow(wCur, p); directTextRow(wTxt, p); srcTextRow(wSrcT, p) }
  if (Buffer.compare(wCur.slice(), wTxt.slice()) !== 0) throw new Error('direct-text is NOT byte-identical to current path')
  if (Buffer.compare(wCur.slice(), wSrcT.slice()) !== 0) throw new Error('src writeBindWith is NOT byte-identical to legacy path')
  wBin.reset(); directBinaryRow(wBin, PARAMS[0]!)
  const b = wBin.slice()
  // structural check: 'B', portal '', stmt, 6 format codes all =1, 6 params, lens 8/n/4/8/1/8
  const fc = b.readInt16BE(1 + 4 + 1 + STMT.length + 1)
  if (b[0] !== 66 || fc !== 6 || b.readInt16BE(1 + 4 + 1 + STMT.length + 1 + 2) !== 1) throw new Error('direct-binary Bind malformed')
  console.log(`byte-identity OK (${wCur.slice().length} bytes/50 rows text; binary row is ${b.length - 22} B vs ${Math.round(wCur.slice().length / 50) - 22} B text)\n`)
}

// ---------- mitata: serialization only ----------
const P1 = PARAMS[0]!

group('serialize 1 row (Bind+Execute+Sync)', () => {
  summary(() => {
    bench('legacy (encodeParam+writeBind)', () => { wCur.reset(); currentRow(wCur, P1); do_not_optimize(wCur) }).gc('inner')
    bench('src text (shipped)', () => { wSrcT.reset(); srcTextRow(wSrcT, P1); do_not_optimize(wSrcT) }).gc('inner')
    bench('src binary plan (shipped)', () => { wSrcB.reset(); srcBinaryRow(wSrcB, P1); do_not_optimize(wSrcB) }).gc('inner')
    bench('proto direct-text', () => { wTxt.reset(); directTextRow(wTxt, P1); do_not_optimize(wTxt) }).gc('inner')
    bench('proto direct-binary', () => { wBin.reset(); directBinaryRow(wBin, P1); do_not_optimize(wBin) }).gc('inner')
  })
})

group(`serialize ${N.toLocaleString()}-row batch into one writer`, () => {
  summary(() => {
    bench('legacy', () => { wCur.reset(); for (let i = 0; i < N; i++) currentRow(wCur, PARAMS[i]!); do_not_optimize(wCur) }).gc('inner')
    bench('src text (shipped)', () => { wSrcT.reset(); for (let i = 0; i < N; i++) srcTextRow(wSrcT, PARAMS[i]!); do_not_optimize(wSrcT) }).gc('inner')
    bench('src binary plan (shipped)', () => { wSrcB.reset(); for (let i = 0; i < N; i++) srcBinaryRow(wSrcB, PARAMS[i]!); do_not_optimize(wSrcB) }).gc('inner')
    bench('proto direct-text', () => { wTxt.reset(); for (let i = 0; i < N; i++) directTextRow(wTxt, PARAMS[i]!); do_not_optimize(wTxt) }).gc('inner')
    bench('proto direct-binary', () => { wBin.reset(); for (let i = 0; i < N; i++) directBinaryRow(wBin, PARAMS[i]!); do_not_optimize(wBin) }).gc('inner')
  })
})

// ---------- mitata: flush strategy (what to do with the filled writer) ----------
wTxt.reset(); for (let i = 0; i < N; i++) directTextRow(wTxt, PARAMS[i]!)
const FILLED = wTxt.slice() // ~1.2MB
const K64 = FILLED.subarray(0, 64 * 1024)

group('flush strategy', () => {
  summary(() => {
    bench('copy 64KB batch (Buffer.from) — real driver, FLUSH_THRESHOLD', () => { do_not_optimize(Buffer.from(K64)) }).gc('inner')
    bench(`copy ${(FILLED.length / 1024 / 1024).toFixed(1)}MB batch (Buffer.from) — CopyIn-sized`, () => { do_not_optimize(Buffer.from(FILLED)) }).gc('inner')
    bench('swap writers (slice handoff, no copy)', () => { do_not_optimize(FILLED.subarray(0, FILLED.length)) }).gc('inner')
  })
})

await run()

// ---------- end-to-end: serialize + flush + write to a discard unix socket ----------
const SOCK = '/tmp/minipg-bind-bench.sock'
try { require('node:fs').unlinkSync(SOCK) } catch { /* absent */ }
let received = 0
Bun.listen({ unix: SOCK, socket: { data: (_s, d) => { received += d.length } } })

let drainWake: (() => void) | null = null
const client = await Bun.connect({
  unix: SOCK,
  socket: { data: () => {}, drain: () => { const r = drainWake; drainWake = null; r?.() } },
})
async function writeAll(buf: Buffer): Promise<void> {
  let off = 0
  while (off < buf.length) {
    const n = client.write(off === 0 ? buf : buf.subarray(off))
    off += n
    if (off < buf.length) await new Promise<void>((r) => { drainWake = r })
  }
}

type E2E = { name: string; run: () => Promise<void> }
const e2e: E2E[] = [
  { name: 'legacy + copy flush', run: async () => { wCur.reset(); for (let i = 0; i < N; i++) currentRow(wCur, PARAMS[i]!); await writeAll(Buffer.from(wCur.slice())) } },
  { name: 'src text + copy flush (shipped)', run: async () => { wSrcT.reset(); for (let i = 0; i < N; i++) srcTextRow(wSrcT, PARAMS[i]!); await writeAll(Buffer.from(wSrcT.slice())) } },
  { name: 'src binary + copy flush (shipped)', run: async () => { wSrcB.reset(); for (let i = 0; i < N; i++) srcBinaryRow(wSrcB, PARAMS[i]!); await writeAll(Buffer.from(wSrcB.slice())) } },
  { name: 'proto direct-binary + swap', run: async () => { wBin.reset(); for (let i = 0; i < N; i++) directBinaryRow(wBin, PARAMS[i]!); await writeAll(wBin.slice()) } },
]

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!
console.log(`\nend-to-end: ${N.toLocaleString()} rows -> discard unix socket (median of 20, after 5 warmup)`)
for (const s of e2e) {
  for (let i = 0; i < 5; i++) await s.run()
  const times: number[] = []
  for (let i = 0; i < 20; i++) { const t0 = performance.now(); await s.run(); times.push(performance.now() - t0) }
  const ms = median(times)
  console.log(`  ${s.name.padEnd(34)} ${ms.toFixed(2).padStart(8)} ms   ${Math.round(N / (ms / 1000)).toLocaleString().padStart(12)} rows/s`)
}
console.log(`  (discard server received ${(received / 1024 / 1024).toFixed(1)} MB total)`)
process.exit(0)
