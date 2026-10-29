// PER-TYPE decode teardown: for each type, one column × N rows, decoded via decode2's TEXT path vs
// its BINARY path, isolated so we can see exactly where binary wins/loses and target improvements.
// Both paths use the same js target so outputs are identical (parity-asserted). No socket.
//   bun bench/per-type-decode.bench.ts   (or: bun run bench:pertype)   — run node too (V8 vs JSC differ)
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { compileResultSet } from '../src/decode.ts'
import type { CodegenCol, Target } from '../src/decode.ts'
import { buildDecoders } from '../src/decode.ts'
import * as wire from '../test/helpers/wire.ts'

const map = buildDecoders()
const N = 1000
const UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const inst = (i: number) => Date.UTC(2021, 5, 1 + (i % 28), 12, 34, i % 60, 789)
const dinst = (i: number) => Date.UTC(2021, 5, 1 + (i % 28))
const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '+00')

interface Spec { label: string; oid: number; js?: Target; text: (i: number) => string; bin: (i: number) => Buffer }
const TYPES: Spec[] = [
  { label: 'int2', oid: 21, text: (i) => String((i % 60000) - 30000), bin: (i) => wire.bin.int2((i % 60000) - 30000) },
  { label: 'int4', oid: 23, text: (i) => String(i * 1000), bin: (i) => wire.bin.int4(i * 1000) },
  { label: 'oid', oid: 26, text: (i) => String(i * 100000), bin: (i) => wire.bin.oid(i * 100000) },
  { label: 'int8 (string)', oid: 20, text: (i) => String(9007199254740000n + BigInt(i)), bin: (i) => wire.bin.int8(9007199254740000n + BigInt(i)) },
  { label: 'int8:number', oid: 20, js: 'number', text: (i) => String(i * 1000000), bin: (i) => wire.bin.int8(BigInt(i * 1000000)) },
  { label: 'bool', oid: 16, text: (i) => (i % 2 ? 't' : 'f'), bin: (i) => wire.bin.bool(!!(i % 2)) },
  { label: 'float4', oid: 700, text: (i) => String(Math.fround(i * 1.5)), bin: (i) => wire.bin.float4(Math.fround(i * 1.5)) },
  { label: 'float8', oid: 701, text: (i) => String(i * 1.5 + 0.125), bin: (i) => wire.bin.float8(i * 1.5 + 0.125) },
  { label: 'uuid', oid: 2950, text: () => UUID, bin: () => wire.bin.uuid(UUID) },
  { label: 'timestamptz:ms', oid: 1184, js: 'ms', text: (i) => iso(inst(i)), bin: (i) => wire.bin.timestamp(inst(i)) },
  { label: 'date:ms', oid: 1082, js: 'ms', text: (i) => new Date(dinst(i)).toISOString().slice(0, 10), bin: (i) => wire.bin.date(dinst(i)) },
  { label: 'bytea', oid: 17, text: () => '\\xdeadbeef', bin: () => wire.bin.bytea(Buffer.from('deadbeef', 'hex')) },
  { label: 'text', oid: 25, text: (i) => 'user_' + i, bin: (i) => wire.bin.text('user_' + i) },
]

for (const t of TYPES) {
  const tCol: CodegenCol = { name: 'c', oid: t.oid, format: 'text', ...(t.js ? { js: t.js } : {}) }
  const bCol: CodegenCol = { name: 'c', oid: t.oid, format: 'binary', ...(t.js ? { js: t.js } : {}) }
  const textBodies = wire.dataRows(Array.from({ length: N }, (_, i) => [t.text(i)] as wire.Cell[]))
  const binBodies = wire.dataRows(Array.from({ length: N }, (_, i) => [t.bin(i)] as wire.Cell[]))
  const tMap = compileResultSet([tCol], 'object', map)
  const bMap = compileResultSet([bCol], 'object', map)
  const bj = (x: unknown) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? v + 'n' : v)) // BigInt-safe
  if (bj(tMap(textBodies)) !== bj(bMap(binBodies))) throw new Error(`parity mismatch: ${t.label}`)
  group(`${t.label} · ${N} rows`, () => {
    summary(() => {
      bench('text', () => do_not_optimize(tMap(textBodies))).gc('inner')
      bench('binary', () => do_not_optimize(bMap(binBodies))).gc('inner')
    })
  })
}

await run()
