// Benches the SHIPPED src JIT encoder (codec.compileBindEncoder, wired into connection serialize behind
// encode:'auto'/'jit') vs the shipped generic binary plan (writeBindWith + compileParamPlan). Asserts
// byte-identity at startup. Run: bun playground/bind-encode/src-jit.bench.ts
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { Writer, writeBindWith, writeExecute, writeSync } from '../../src/protocol.ts'
import { compileParamPlan, compileBindEncoder } from '../../src/encode.ts'

const STMT = 'i_pipe'
const OIDS = [20, 25, 23, 701, 16, 1184] // int8, text, int4, float8, bool, timestamptz
const BASE = Date.UTC(2026, 0, 1)
const N = 10_000
const PARAMS: unknown[][] = new Array(N)
for (let i = 0; i < N; i++) PARAMS[i] = [i + 1, `name_${i}_${(i * 2654435761 % 100000).toString(36)}`, i % 1000, (i % 90000) + 0.25, i % 2 === 0, new Date(BASE + (i % 86400) * 1000)]

const plan = compileParamPlan(OIDS)!
const jit = compileBindEncoder(STMT, OIDS, 0)!
const shipped = (w: Writer, v: unknown[]) => { writeBindWith(w, '', STMT, v, plan, 0); writeExecute(w, '', 0); writeSync(w) }

{ // byte-identity of the shipped src paths
  const wa = new Writer(1 << 16), wb = new Writer(1 << 16)
  shipped(wa, PARAMS[0]!); jit(wb, PARAMS[0]!)
  if (!Buffer.from(wa.slice()).equals(Buffer.from(wb.slice()))) throw new Error('NOT byte-identical')
  console.log('byte-identity OK: src compileBindEncoder == writeBindWith + Execute + Sync\n')
}

const wA = new Writer(1 << 21), wB = new Writer(1 << 21)
summary(() => {
  group('scalar row (6 params, single)', () => {
    bench('shipped binary plan', () => { wA.reset(); shipped(wA, PARAMS[0]!); do_not_optimize(wA) }).gc('inner')
    bench('src JIT', () => { wB.reset(); jit(wB, PARAMS[0]!); do_not_optimize(wB) }).gc('inner')
  })
  group('10k-row batch', () => {
    bench('shipped binary plan', () => { wA.reset(); for (let i = 0; i < N; i++) shipped(wA, PARAMS[i]!); do_not_optimize(wA) }).gc('inner')
    bench('src JIT', () => { wB.reset(); for (let i = 0; i < N; i++) jit(wB, PARAMS[i]!); do_not_optimize(wB) }).gc('inner')
  })
})
await run()
