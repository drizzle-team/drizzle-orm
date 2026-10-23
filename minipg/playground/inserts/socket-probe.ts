// Root-cause probe for the pipelined-socket regression: inject an instrumented socket via config.socket
// (raw node:net — identical to minipg's own unix-socket path, minus TLS which trust/plaintext doesn't need)
// and count read events (= onData / parse-loop invocations) + write calls, with size histograms. Compare
// the SAME pipelined bulkInsert over a unix socket vs TCP:
//   USE_TCP=0 bun playground/inserts/socket-probe.ts        # unix socket
//   USE_TCP=1 bun playground/inserts/socket-probe.ts        # TCP 127.0.0.1:54329
import net from 'node:net'
import type { Duplex } from 'node:stream'
import { connect } from '../../src/index.ts'

const N = Number(process.argv[2] ?? 200_000)
const CHUNK = Number(process.env.BULK_CHUNK ?? 1000)
const SPLIT = Number(process.env.SPLIT ?? 0) // >0: split each socket write into <=SPLIT-byte pieces (mitigation test)
const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'
const useTcp = process.env.USE_TCP === '1'

let reads = 0, readBytes = 0, writes = 0, writeBytes = 0
const rHist: Record<string, number> = {}, wHist: Record<string, number> = {}
const bucket = (n: number) => (n < 64 ? '<64' : n < 256 ? '<256' : n < 1024 ? '<1K' : n < 4096 ? '<4K' : n < 16384 ? '<16K' : n < 65536 ? '<64K' : '>=64K')
const hist = (h: Record<string, number>) => ['<64', '<256', '<1K', '<4K', '<16K', '<64K', '>=64K'].filter((k) => h[k]).map((k) => `${k}:${h[k]}`).join('  ')

function mkSocket(): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const sock = useTcp ? net.connect({ host: '127.0.0.1', port: 54329 }) : net.connect({ path: SOCK })
    sock.setNoDelay?.(true)
    sock.once('connect', () => {
      sock.on('data', (b: Buffer) => { reads++; readBytes += b.length; rHist[bucket(b.length)] = (rHist[bucket(b.length)] ?? 0) + 1 })
      const ow = sock.write.bind(sock) as (...x: unknown[]) => unknown
      const tally = (len: number) => { writes++; writeBytes += len; wHist[bucket(len)] = (wHist[bucket(len)] ?? 0) + 1 }
      ;(sock as unknown as { write: unknown }).write = (c: Buffer, ...a: unknown[]) => {
        if (c && (c as Buffer).length !== undefined) {
          if (SPLIT && c.length > SPLIT) { // split one big write into <=SPLIT pieces; callback rides the last piece
            let r: unknown = true
            for (let o = 0; o < c.length; o += SPLIT) { const p = c.subarray(o, Math.min(o + SPLIT, c.length)); tally(p.length); r = o + SPLIT >= c.length ? ow(p, ...a) : ow(p) }
            return r
          }
          tally(c.length)
        }
        return ow(c, ...a)
      }
      resolve(sock)
    })
    sock.once('error', reject)
  })
}

const DEPTH = Number(process.env.PIPE_DEPTH ?? 0) // >0: cap in-flight pipelined queries to DEPTH
const db = await connect({ socket: mkSocket, host: 'localhost', user: 'postgres', database: 'testdb', ...(DEPTH ? { pipeline: { depth: DEPTH } } : {}) })
const COLS = { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' } as const
await db.query('drop table if exists probe_bench')
await db.query('create unlogged table probe_bench(id int8, name text, qty int4, price float8, flag bool, created_at timestamptz)')
const BASE = Date.UTC(2026, 0, 1)
const rows: unknown[][] = Array.from({ length: N }, (_, i) => [i + 1, `name_${i}_${(i * 2654435761 % 100000).toString(36)}`, i % 1000, (i % 90000) + 0.25, i % 2 === 0, new Date(BASE + (i % 86400) * 1000)])

await db.bulkInsert('probe_bench', COLS, rows, { chunk: CHUNK }) // warmup (also settles prepared stmt)
reads = readBytes = writes = writeBytes = 0
for (const k of Object.keys(rHist)) delete rHist[k]
for (const k of Object.keys(wHist)) delete wHist[k]
const cpu0 = process.cpuUsage(), t0 = performance.now()
await db.bulkInsert('probe_bench', COLS, rows, { chunk: CHUNK })
const wall = performance.now() - t0, cpu = process.cpuUsage(cpu0)

console.log(`\nsocket-probe — ${N.toLocaleString()} rows, pipelined chunk=1000 — transport=${useTcp ? 'TCP' : 'unix socket'}`)
console.log(`  wall ${wall.toFixed(0)}ms · CPU ${((cpu.user + cpu.system) / 1000).toFixed(0)}ms`)
console.log(`  READS  ${reads}  (${(readBytes / 1048576).toFixed(1)} MB, avg ${(readBytes / reads).toFixed(0)} B)   ${hist(rHist)}`)
console.log(`  WRITES ${writes}  (${(writeBytes / 1048576).toFixed(1)} MB, avg ${(writeBytes / writes).toFixed(0)} B)   ${hist(wHist)}`)

await db.query('drop table if exists probe_bench')
await db.end()
