// DB-side pressure: single SELECT * vs cursor().all() vs cursor streamed.
// Measures the BACKEND process (peak RSS polled at 25ms, CPU time via ps) and the client
// (RSS + JS heap). Each lane runs twice on its own fresh connection: round 1 includes the
// backend first-touching shared_buffers pages (RSS grows by ~table size mapped in), round 2
// is the honest per-query delta.   bun playground/copy-out/db-pressure.ts
import { connect, type Connection } from '../../src/index.ts'
const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'
const DB = { user: 'postgres', database: 'testdb' }

const ps = (pid: number): { rss: number; cpu: number } => {
  const out = Bun.spawnSync(['ps', '-o', 'rss=,time=', '-p', String(pid)]).stdout.toString().trim().split(/\s+/)
  const t = out[1]!.split(':').map(Number)
  return { rss: Number(out[0]), cpu: t.length === 3 ? t[0]! * 3600 + t[1]! * 60 + t[2]! : t[0]! * 60 + t[1]! }
}
const mb = (kb: number) => `${(kb / 1024).toFixed(1)}MB`

const mc = await connect({ path: SOCK, ...DB })
await mc.query('drop table if exists bft')
await mc.query('create table bft(id int8 primary key, name text, qty int4, price float8, flag bool, created_at timestamptz)')
{
  const N = 1_000_000
  const rows: Record<string, unknown>[] = new Array(N)
  for (let i = 0; i < N; i++) rows[i] = { id: i + 1, name: `n_${i}`, qty: i % 1000, price: i + 0.25, flag: i % 2 === 0, created_at: new Date(1767225600000 + (i % 86400) * 1000) }
  await mc.copyMany('bft', { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' }, rows, { chunk: 250_000, atomic: false })
  await mc.query('vacuum analyze bft')
}
console.log(`table: ${mb(Number((await mc.query(`select (pg_relation_size('bft')/1024)::int4`)).rows[0]![0 as never]))}, shared_buffers: ${(await mc.query('show shared_buffers')).rows[0]![0 as never]}`)
await mc.query('select count(*) from bft') // prewarm shared_buffers

const SHAPE = { id: 'bigint:number', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' } as const

const lane = async (label: string, run: (c: Connection) => Promise<unknown[] | number>): Promise<void> => {
  const c = await connect({ path: SOCK, ...DB })
  const pid = Number(((await c.query('select pg_backend_pid()')).rows[0] as unknown[])[0])
  for (let round = 1; round <= 2; round++) {
    Bun.gc(true)
    await Bun.sleep(150)
    const base = ps(pid)
    const cBase = process.memoryUsage()
    let peak = base.rss
    const poll = setInterval(() => { const r = ps(pid).rss; if (r > peak) peak = r }, 25)
    const t0 = performance.now()
    const result = await run(c)
    const ms = performance.now() - t0
    const cEnd = process.memoryUsage() // rows still referenced by `result`
    clearInterval(poll)
    const end = ps(pid)
    peak = Math.max(peak, end.rss)
    const n = typeof result === 'number' ? result : result.length
    console.log(`${label} r${round}  ${String(n).padStart(7)} rows ${Math.round(ms).toString().padStart(5)}ms | backend: peakΔ ${mb(peak - base.rss).padStart(8)} endΔ ${mb(end.rss - base.rss).padStart(8)} cpu ${(end.cpu - base.cpu).toFixed(2)}s | client: rssΔ ${mb((cEnd.rss - cBase.rss) / 1024).padStart(8)} heapΔ ${mb((cEnd.heapUsed - cBase.heapUsed) / 1024).padStart(8)}`)
  }
  const ctx = await c.query('select (sum(total_bytes)/1024)::int4 from pg_backend_memory_contexts')
  console.log(`${label}     backend memory contexts after: ${mb(Number((ctx.rows[0] as unknown[])[0]))}`)
  await c.end()
}

await lane('select * (one query)   ', async (c) => (await c.query('select * from bft', [], { mode: 'object', shape: SHAPE as never })).rows)
await lane('cursor.all()  20k      ', (c) => c.cursor({ sql: 'select * from bft', fetchSize: 20000, fullScan: true, shape: SHAPE as never }).all())
await lane('cursor stream 20k      ', async (c) => {
  let n = 0
  for await (const b of c.cursor({ sql: 'select * from bft', fetchSize: 20000, fullScan: true, shape: SHAPE as never }).batches()) n += b.length
  return n
})
await mc.query('drop table bft')
await mc.end()
process.exit(0)
