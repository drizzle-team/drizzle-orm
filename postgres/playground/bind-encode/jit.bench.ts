// JIT param-encoder exploration: when the param shape is declared upfront (bulkInsert, ORM
// `params`), a per-statement CODEGEN'd encoder can beat the generic compiled plan:
//   - the Bind framing (portal, statement, format codes, param count) collapses to ONE constant
//     Buffer memcpy (only the message length + values vary)
//   - per-column guards + writes are inlined straight-line (no closure dispatch per value)
//   - Execute+Sync append as a second constant memcpy
// NOT wired into src — this decides whether a jit tier for compileParamPlan is worth it,
// mirroring the decode-side 'jit' | 'interpreted' mapper split.
//
//   bun playground/bind-encode/jit.bench.ts
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { Writer, W, writeBindWith, writeExecute, writeSync } from '../../src/protocol.ts'
import { encodeValueInto, compileParamPlan } from '../../src/encode.ts'

const STMT = 'i_pipe'
const OIDS = [20, 25, 23, 701, 16, 1184] // int8, text, int4, float8, bool, timestamptz
const PG_EPOCH_MS = 946684800000

// ---------- workload ----------
const BASE = Date.UTC(2026, 0, 1)
const N = 10_000
const PARAMS: unknown[][] = new Array(N)
for (let i = 0; i < N; i++) {
  PARAMS[i] = [i + 1, `name_${i}_${(i * 2654435761 % 100000).toString(36)}`, i % 1000, (i % 90000) + 0.25, i % 2 === 0, new Date(BASE + (i % 86400) * 1000)]
}

// ---------- codegen ----------
const cstrBuf = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])
const i16buf = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(n, 0); return b }

/** Build a specialized (w, v) => void serializing Bind+Execute+Sync for this exact statement. */
function jitRowEncoder(stmt: string, oids: readonly number[], binary: boolean): (w: Writer, v: readonly unknown[]) => void {
  const n = oids.length
  const fmts = oids.map((o) => (binary && [16, 21, 23, 20, 701, 1114, 1184].includes(o) ? 1 : 0))
  // constant bytes between the length field and the first value: portal '' + stmt + fmt codes + count
  const PREFIX = Buffer.concat([cstrBuf(''), cstrBuf(stmt), i16buf(n), ...fmts.map(i16buf), i16buf(n)])
  const FMT_OFF = 1 + stmt.length + 1 + 2 // offset of fmt slot 0 inside PREFIX
  const EXECSYNC = Buffer.concat([W.execute('', 0), W.sync()])
  const src: string[] = ['w.start("B");', 'const base = w.mark();', 'w.bytes(PREFIX);']
  for (let i = 0; i < n; i++) {
    const fb = `w.patch16(base + ${FMT_OFF + i * 2}, enc(w, x))` // per-value fallback: generic text + fix the format code
    let fast: string
    if (binary) {
      switch (oids[i]) {
        case 20: fast = `if (typeof x === 'number' && Number.isSafeInteger(x)) w.lpI64(x); else ${fb}`; break
        case 23: fast = `if (typeof x === 'number' && Number.isInteger(x) && x >= -2147483648 && x <= 2147483647) { w.int32(4); w.int32(x) } else ${fb}`; break
        case 701: fast = `if (typeof x === 'number') w.lpF8(x); else ${fb}`; break
        case 16: fast = `if (typeof x === 'boolean') { w.int32(1); w.byte(x ? 1 : 0) } else ${fb}`; break
        case 1114: case 1184: fast = `if (x instanceof Date) { const ms = x.getTime() - ${PG_EPOCH_MS}; w.lpI64(ms * 1000) } else ${fb}`; break
        case 25: case 1043: fast = `if (typeof x === 'string' && x.indexOf('\\0') === -1) w.lpStr(x); else ${fb}`; break
        default: fast = fb
      }
    } else {
      switch (oids[i]) {
        case 20: case 23: fast = `if (typeof x === 'number' && Number.isSafeInteger(x)) w.lpAsciiInt(x); else ${fb}`; break
        case 701: fast = `if (typeof x === 'number') w.lpStr(String(x)); else ${fb}`; break
        case 16: fast = `if (typeof x === 'boolean') { w.int32(1); w.byte(x ? 116 : 102) } else ${fb}`; break
        case 1114: case 1184: fast = `if (x instanceof Date) w.lpStr(x.toISOString()); else ${fb}`; break
        case 25: case 1043: fast = `if (typeof x === 'string' && x.indexOf('\\0') === -1) w.lpStr(x); else ${fb}`; break
        default: fast = fb
      }
    }
    src.push(`{ const x = v[${i}]; if (x == null) w.int32(-1); else { ${fast} } }`)
  }
  src.push('w.int16(1); w.int16(0);', 'w.end();', 'w.bytes(EXECSYNC);')
  return new Function('PREFIX', 'EXECSYNC', 'enc', `return (w, v) => { ${src.join('\n')} }`)(PREFIX, EXECSYNC, encodeValueInto) as never
}

/** Specialized binary-array column encoder (the bulkInsert/unnest hot loop), int8 elements. */
function jitInt8Array(): (w: Writer, a: readonly unknown[]) => void {
  return new Function('MIS', `return (w, a) => {
    let hn = 0
    for (let i = 0; i < a.length; i++) if (a[i] == null) { hn = 1; break }
    const lp = w.mark(); w.int32(0)
    w.int32(1); w.int32(hn); w.int32(20); w.int32(a.length); w.int32(1)
    for (let i = 0; i < a.length; i++) {
      const x = a[i]
      if (x == null) w.int32(-1)
      else if (typeof x === 'number' && Number.isSafeInteger(x)) w.lpI64(x)
      else throw MIS
    }
    w.patch32(lp, w.mark() - lp - 4)
  }`)(new TypeError('mismatch')) as never
}

// ---------- lanes ----------
const PLAN = compileParamPlan(OIDS)!
const jitBin = jitRowEncoder(STMT, OIDS, true)
const jitTxt = jitRowEncoder(STMT, OIDS, false)
const wA = new Writer(1 << 21), wB = new Writer(1 << 21), wC = new Writer(1 << 21), wD = new Writer(1 << 21)

const genericPlanRow = (w: Writer, v: unknown[]) => { writeBindWith(w, '', STMT, v, PLAN, 0); writeExecute(w, '', 0); writeSync(w) }
const genericTextRow = (w: Writer, v: unknown[]) => { writeBindWith(w, '', STMT, v, encodeValueInto, 0); writeExecute(w, '', 0); writeSync(w) }

// sanity: jit output must be byte-identical to the shipped generic paths
{
  wA.reset(); wB.reset(); wC.reset(); wD.reset()
  for (const p of PARAMS.slice(0, 50)) { genericPlanRow(wA, p); jitBin(wB, p); genericTextRow(wC, p); jitTxt(wD, p) }
  if (Buffer.compare(wA.slice(), wB.slice()) !== 0) throw new Error('jit binary != shipped plan bytes')
  if (Buffer.compare(wC.slice(), wD.slice()) !== 0) throw new Error('jit text != shipped text bytes')
  console.log('byte-identity OK (jit binary == shipped plan, jit text == shipped text)\n')
}

const P1 = PARAMS[0]!
group('scalar row: shipped generic vs JIT (1 row, Bind+Execute+Sync)', () => {
  summary(() => {
    bench('shipped text (generic dispatch)', () => { wC.reset(); genericTextRow(wC, P1); do_not_optimize(wC) }).gc('inner')
    bench('JIT text', () => { wD.reset(); jitTxt(wD, P1); do_not_optimize(wD) }).gc('inner')
    bench('shipped binary plan (closure/column)', () => { wA.reset(); genericPlanRow(wA, P1); do_not_optimize(wA) }).gc('inner')
    bench('JIT binary', () => { wB.reset(); jitBin(wB, P1); do_not_optimize(wB) }).gc('inner')
  })
})

group(`scalar rows: ${N.toLocaleString()}-row batch`, () => {
  summary(() => {
    bench('shipped binary plan', () => { wA.reset(); for (let i = 0; i < N; i++) genericPlanRow(wA, PARAMS[i]!); do_not_optimize(wA) }).gc('inner')
    bench('JIT binary', () => { wB.reset(); for (let i = 0; i < N; i++) jitBin(wB, PARAMS[i]!); do_not_optimize(wB) }).gc('inner')
  })
})

// array column encode (the bulkInsert hot loop): 10k int8 elements
const IDS: number[] = Array.from({ length: N }, (_, i) => i + 1)
const ARR_PLAN = compileParamPlan([1016])!
const jitArr = jitInt8Array()
group('array column: 10k-elem int8[] encode', () => {
  summary(() => {
    bench('shipped arrayEnc (elem closure)', () => { wA.reset(); ARR_PLAN(wA, IDS, 0); do_not_optimize(wA) }).gc('inner')
    bench('JIT array (inlined loop)', () => { wB.reset(); jitArr(wB, IDS); do_not_optimize(wB) }).gc('inner')
  })
})

await run()
