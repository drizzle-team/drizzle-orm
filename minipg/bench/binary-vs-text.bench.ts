// BINARY vs TEXT result format, two ways:
//   1) decode-isolated — pre-built synthetic DataRow bodies (text vs binary) through decode2's mappers.
//      Pure driver-side decode signal, no socket. Runs on both engines.
//   2) end-to-end — Connection.queryTyped with a text plan vs a binary plan over the unix socket to the
//      real cluster: captures server formatting cost + wire size + driver decode together.
// Both paths use the SAME js targets so the decoded rows are identical (parity-asserted) — only the
// wire format differs. Needs `bun run test:setup`.
//   bun bench/binary-vs-text.bench.ts   (or: bun run bench:binary)   — run node too for the isolated part
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { compileResultSet } from '../src/decode.ts'
import type { CodegenCol } from '../src/decode.ts'
import { buildDecoders } from '../src/decode.ts'
import { connect } from '../src/index.ts'
import * as wire from '../test/helpers/wire.ts'

const map = buildDecoders()
const N = 1000
const UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

// mixed numeric/temporal shape — all columns binary-eligible; same js targets in both plans.
const cols = (format: 'text' | 'binary'): CodegenCol[] => [
  { name: 'id', oid: 23, format },
  { name: 'a', oid: 701, format },
  { name: 'b', oid: 701, format },
  { name: 'big', oid: 20, format },
  { name: 'ts', oid: 1184, format, js: 'ms' },
  { name: 'd', oid: 1082, format, js: 'ms' },
  { name: 'u', oid: 2950, format },
  { name: 'ok', oid: 16, format },
]
const inst = (i: number) => Date.UTC(2021, 5, 1 + (i % 28), 12, 34, i % 60, 789)
const dinst = (i: number) => Date.UTC(2021, 5, 1 + (i % 28))

// --- 1) decode-isolated: build matching text + binary bodies ---
const textBodies = wire.dataRows(Array.from({ length: N }, (_, i) => [
  String(i), String(i * 1.5), String(i * 2.25), String(9007199254740000n + BigInt(i)),
  new Date(inst(i)).toISOString().replace('T', ' ').replace('Z', '+00'),
  new Date(dinst(i)).toISOString().slice(0, 10), UUID, i % 2 ? 't' : 'f',
] as wire.Cell[]))
const binBodies = wire.dataRows(Array.from({ length: N }, (_, i) => [
  wire.bin.int4(i), wire.bin.float8(i * 1.5), wire.bin.float8(i * 2.25), wire.bin.int8(9007199254740000n + BigInt(i)),
  wire.bin.timestamp(inst(i)), wire.bin.date(dinst(i)), wire.bin.uuid(UUID), wire.bin.bool(!!(i % 2)),
] as wire.Cell[]))

const textMapper = compileResultSet(cols('text'), 'object', map)
const binMapper = compileResultSet(cols('binary'), 'object', map)
if (JSON.stringify(textMapper(textBodies)) !== JSON.stringify(binMapper(binBodies))) throw new Error('decode-isolated: text != binary output')

group(`decode-isolated · ${N} rows × 8 cols · text vs binary`, () => {
  summary(() => {
    bench('text  (parse)', () => do_not_optimize(textMapper(textBodies))).gc('inner')
    bench('binary (read)', () => do_not_optimize(binMapper(binBodies))).gc('inner')
  })
})

// --- 2) end-to-end vs real PG (queryTyped text-plan vs binary-plan over the unix socket) ---
const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'
const E2E = (n: number) => `select g::int4 as id, (g*1.5)::float8 as a, (g*2.25)::float8 as b, (9007199254740000+g)::int8 as big, '2021-06-02 12:34:56.789+00'::timestamptz as ts, '2021-06-02'::date as d, '${UUID}'::uuid as u, (g%2=0) as ok from generate_series(1, ${n}) g`

let conn: Awaited<ReturnType<typeof connect>> | null = null
try { conn = await connect({ path: SOCK, user: 'postgres', database: 'testdb', password: '' }) } catch (e) { console.log('(e2e skipped — cluster down:', (e as Error).message, ')') }

if (conn) {
  const c = conn
  const sql = E2E(N)
  const runText = () => c.queryTyped(sql, [], cols('text'), { mode: 'object' })
  const runBin = () => c.queryTyped(sql, [], cols('binary'), { mode: 'object' })
  for (let i = 0; i < 5; i++) { await runText(); await runBin() } // warm
  if (JSON.stringify((await runText()).rows[0]) !== JSON.stringify((await runBin()).rows[0])) throw new Error('e2e: text != binary row')
  group(`end-to-end · ${N} rows × 8 cols · unix socket · text plan vs binary plan`, () => {
    summary(() => {
      bench('text plan  (server formats + parse)', async () => { do_not_optimize(await runText()) }).gc('inner')
      bench('binary plan (server sends raw + read)', async () => { do_not_optimize(await runBin()) }).gc('inner')
    })
  })
}

await run()
if (conn) await conn.end()
process.exit(0)
