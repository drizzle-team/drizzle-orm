// Backfill read-path tuning: object vs array vs shape(binary) vs named-FETCH reuse vs
// RANGE-PARTITIONED parallel cursors (cursors force non-parallel plans server-side; k ranges
// on k connections engage k backends). 1M rows, interleaved rounds.
//   bun playground/copy-out/backfill-tuning.ts
import { connect } from '../../src/index.ts'
const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'
const DB = { user: 'postgres', database: 'testdb' }
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
const SHAPE = { id: 'bigint:number', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' } as const
const drain = async (cur: { batches(): AsyncGenerator<unknown[]> }): Promise<number> => {
  let n = 0
  for await (const b of cur.batches()) n += b.length
  return n
}
const rangeLanes = (k: number) => async (): Promise<number> => {
  const conns = await Promise.all(Array.from({ length: k }, () => connect({ path: SOCK, ...DB })))
  try {
    const step = Math.ceil(1_000_000 / k)
    const counts = await Promise.all(conns.map((c, i) =>
      drain(c.cursor({ sql: `select * from bft where id > ${i * step} and id <= ${(i + 1) * step}`, fetchSize: 20000, fullScan: true }))))
    return counts.reduce((a, b) => a + b, 0)
  } finally { await Promise.all(conns.map((c) => c.end())) }
}
const LANES: [string, () => Promise<number>][] = [
  ['object, 20k (baseline)', () => drain(mc.cursor({ sql: 'select * from bft', fetchSize: 20000, fullScan: true }))],
  ['array, 20k', () => drain(mc.cursor({ sql: 'select * from bft', fetchSize: 20000, fullScan: true, mode: 'array' }))],
  ['object + shape (binary), 20k', () => drain(mc.cursor({ sql: 'select * from bft', fetchSize: 20000, fullScan: true, shape: SHAPE as never }))],
  ['2 range cursors (2 conns)', rangeLanes(2)],
  ['4 range cursors (4 conns)', rangeLanes(4)],
]
const res = new Map<string, number[]>(LANES.map(([k]) => [k, []]))
for (const [, run] of LANES) await run()
for (let r = 0; r < 3; r++) {
  for (const [k, run] of LANES) {
    const t0 = performance.now()
    const n = await run()
    if (n !== 1_000_000) throw new Error(`${k}: bad count ${n}`)
    res.get(k)!.push(performance.now() - t0)
  }
}
for (const [k] of LANES) {
  const s = [...res.get(k)!].sort((a, b) => a - b)
  console.log(`${k.padEnd(34)} ${Math.round(1_000_000 / (s[1]! / 1000)).toLocaleString().padStart(10)} rows/s  (${Math.round(1_000_000 / (s[2]! / 1000)).toLocaleString()}..${Math.round(1_000_000 / (s[0]! / 1000)).toLocaleString()})`)
}
await mc.query('drop table bft')
await mc.end()
process.exit(0)
