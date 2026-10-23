// Self-contained RESOURCE bench for a 1M-row bulkInsert — designed to be compared against equivalent
// Go/Rust programs. Only the insert is timed: rows are pre-built and the connection is pre-established, so
// this measures the driver's bulk-insert cost, not row generation or connect.
//
//   bun run test:setup                                   # local cluster (unix socket)
//   bun --smol playground/inserts/bulk-1m-resources.bench.ts            # N=1,000,000, RUNS=3
//   bun playground/inserts/bulk-1m-resources.bench.ts 500000 5          # N, RUNS
//   MINIPG_URL='postgres://user:pass@host:5432/db' bun playground/inserts/bulk-1m-resources.bench.ts
//
// Metrics — PORTABLE (measure the same in Go/Rust): wall time, throughput (rows/s), CPU user/system/total
// (Go: syscall.Getrusage; Rust: libc::getrusage), peak RSS + RSS delta (getrusage maxrss). JS-ONLY:
// event-loop max/p99 lag and GC heap delta (no equivalent in Go/Rust — report separately).
//
// For a fair cross-language comparison: point all runners at the SAME Postgres (a TCP host, not the unix
// socket), insert 1M rows of the SAME 6-column schema via each ecosystem's bulk path — Go pgx CopyFrom (or
// a batched multi-row insert), Rust tokio-postgres COPY / sqlx — and pre-build the rows before timing.
import { connect } from '../../src/index.ts'

const N = Number(process.argv[2] ?? 1_000_000)
const RUNS = Number(process.argv[3] ?? 3)
const CHUNK = Number(process.env.BULK_CHUNK ?? 1000) // fixed chunk so Go/Rust use the SAME; BULK_CHUNK=0 -> minipg's adaptive default
const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'
const NO_PIPE = !!process.env.NO_PIPELINE // NO_PIPELINE=1 -> await each chunk (match a naive Go/Rust loop)
const DEPTH = Number(process.env.PIPE_DEPTH ?? 0) // >0 -> cap in-flight pipelined queries to DEPTH
const cfg = process.env.MINIPG_URL ? { url: process.env.MINIPG_URL } : { path: SOCK, user: 'postgres', database: 'testdb', password: 'postgres' }
const pipeOpt = NO_PIPE ? { pipeline: false as const } : DEPTH ? { pipeline: { depth: DEPTH } } : {}
const db = await connect({ ...cfg, ...pipeOpt })
const gc = () => (globalThis as { Bun?: { gc(force: boolean): void } }).Bun?.gc(true)

const LOGGED = process.env.LOGGED === '1' // LOGGED=1 -> WAL-logged table (realistic durability); default UNLOGGED (fast)
const MODE = process.env.MODE ?? 'insert' // 'insert' = bulkInsert(unnest) | 'copy' = copyMany(COPY protocol)
const COLS = { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' } as const
await db.query('drop table if exists bulk_bench')
await db.query(`create ${LOGGED ? '' : 'unlogged '}table bulk_bench(id int8, name text, qty int4, price float8, flag bool, created_at timestamptz)`)

// rows built ONCE, OUTSIDE the timed section (a Go/Rust bench would likewise pre-build its slice/Vec)
const BASE = Date.UTC(2026, 0, 1)
const rows: unknown[][] = new Array(N)
for (let i = 0; i < N; i++) rows[i] = [i + 1, `name_${i}_${(i * 2654435761 % 100000).toString(36)}`, i % 1000, (i % 90000) + 0.25, i % 2 === 0, new Date(BASE + (i % 86400) * 1000)]

interface M { wallMs: number; cpuUserMs: number; cpuSysMs: number; peakRssMB: number; rssDeltaMB: number; heapDeltaMB: number; elMaxMs: number; elP99Ms: number }
const MB = 1 << 20

async function measure(): Promise<M> {
  await db.query('truncate bulk_bench')
  gc()
  const base = process.memoryUsage()
  let peakRss = base.rss
  const lags: number[] = []
  let last = performance.now(), elMax = 0
  const timer = setInterval(() => {
    const now = performance.now(); const lag = now - last - 2; if (lag > elMax) elMax = lag; if (lag > 0) lags.push(lag); last = now
    const r = process.memoryUsage().rss; if (r > peakRss) peakRss = r
  }, 2)
  const cpu0 = process.cpuUsage(); const t0 = performance.now()
  if (MODE === 'copy') await db.copyMany('bulk_bench', COLS, rows) // COPY protocol (drain-aware pumpCopy)
  else await db.bulkInsert('bulk_bench', COLS, rows, CHUNK > 0 ? { chunk: CHUNK } : {}) // unnest; CHUNK=0 -> adaptive
  const wallMs = performance.now() - t0; const cpu = process.cpuUsage(cpu0)
  clearInterval(timer)
  const end = process.memoryUsage(); if (end.rss > peakRss) peakRss = end.rss
  lags.sort((a, b) => a - b)
  return {
    wallMs, cpuUserMs: cpu.user / 1000, cpuSysMs: cpu.system / 1000,
    peakRssMB: peakRss / MB, rssDeltaMB: (end.rss - base.rss) / MB, heapDeltaMB: (end.heapUsed - base.heapUsed) / MB,
    elMaxMs: elMax, elP99Ms: lags[Math.floor(lags.length * 0.99)] ?? 0,
  }
}

await measure() // warmup
const rs: M[] = []
for (let r = 0; r < RUNS; r++) rs.push(await measure())
const med = (f: (m: M) => number) => rs.map(f).sort((a, b) => a - b)[Math.floor(RUNS / 2)]!
const wall = med((m) => m.wallMs), cpuU = med((m) => m.cpuUserMs), cpuS = med((m) => m.cpuSysMs)
const rt = (globalThis as { Bun?: { version: string } }).Bun ? 'Bun ' + (globalThis as { Bun: { version: string } }).Bun.version : 'Node ' + process.version

console.log(`\nminipg bulkInsert — ${N.toLocaleString()} rows into (id,name,qty,price,flag,created_at) — median of ${RUNS} (1 warmup)`)
console.log(`  runtime: ${rt} · ${process.platform}/${process.arch} · chunk=${CHUNK > 0 ? CHUNK : 'auto'} · pipeline=${NO_PIPE ? 'OFF (sequential)' : 'on'}\n`)
console.log('  ── PORTABLE (compare to Go/Rust) ──────────────')
console.log(`  wall time    ${wall.toFixed(0).padStart(7)} ms`)
console.log(`  throughput   ${(N / (wall / 1000) / 1e6).toFixed(3).padStart(7)} M rows/s`)
console.log(`  CPU user     ${cpuU.toFixed(0).padStart(7)} ms`)
console.log(`  CPU system   ${cpuS.toFixed(0).padStart(7)} ms`)
console.log(`  CPU total    ${(cpuU + cpuS).toFixed(0).padStart(7)} ms   (${(((cpuU + cpuS) / wall) * 100).toFixed(0)}% of wall — rest is DB/network wait)`)
console.log(`  peak RSS     ${med((m) => m.peakRssMB).toFixed(0).padStart(7)} MB   (incl. the ${N.toLocaleString()} pre-built rows)`)
console.log(`  RSS delta    ${med((m) => m.rssDeltaMB).toFixed(0).padStart(7)} MB   (driver transient during the insert)`)
console.log('  ── JS-ONLY (no Go/Rust equivalent) ────────────')
console.log(`  heap delta   ${med((m) => m.heapDeltaMB).toFixed(1).padStart(7)} MB`)
console.log(`  event-loop max ${med((m) => m.elMaxMs).toFixed(1).padStart(5)} ms   p99 ${med((m) => m.elP99Ms).toFixed(2)} ms`)

await db.query('drop table if exists bulk_bench')
await db.end()
