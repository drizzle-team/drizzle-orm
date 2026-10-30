// Shipped bulkUpdate vs the manual shapes from the original probe. Interleaved rounds + hygiene.
//   bun playground/updates/bulk-update.bench.ts
import { connect } from '../../src/index.ts'
const mc = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' })
const N = 1_000_000, U = 100_000
await mc.query('drop table if exists bub')
await mc.query('create table bub(id int8 primary key, name text, qty int4, price float8, flag bool, created_at timestamptz)')
{
  const rows: Record<string, unknown>[] = new Array(N)
  for (let i = 0; i < N; i++) rows[i] = { id: i + 1, name: `n_${i}`, qty: i % 1000, price: i + 0.25, flag: i % 2 === 0, created_at: new Date(1767225600000 + (i % 86400) * 1000) }
  await mc.copyMany('bub', { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' }, rows, { chunk: 250_000, atomic: false })
  await mc.query('vacuum analyze bub')
}
interface Upd { id: number; name: string; qty: number; price: number }
let gen = 0
const mkU = (): Upd[] => { gen++; const step = Math.floor(N / U); return Array.from({ length: U }, (_, i) => ({ id: i * step + 1, name: `u${gen}_${i}`, qty: 1_000_000 + gen, price: i + 0.5 })) }
const UCOLS = { id: 'int8', name: 'text', qty: 'int4', price: 'float8' } as const
const UNNEST = `update bub t set name = u.name, qty = u.qty, price = u.price from unnest($1::int8[],$2::text[],$3::int4[],$4::float8[]) as u(id,name,qty,price) where t.id = u.id`
const sync = async () => { await mc.query('checkpoint'); await Bun.sleep(600) }
const LANES: [string, (u: Upd[]) => Promise<unknown>][] = [
  ['bulkUpdate (adaptive chunk)', (u) => mc.bulkUpdate('bub', UCOLS, u as never, { by: 'id' })],
  ['manual unnest-join ×1k, one tx', (u) => mc.begin(async (tx) => {
    const ps: Promise<unknown>[] = []
    for (let i = 0; i < u.length; i += 1000) {
      const p = u.slice(i, i + 1000)
      ps.push(tx.query(UNNEST, [p.map((r) => r.id), p.map((r) => r.name), p.map((r) => r.qty), p.map((r) => r.price)], { name: 'mu', params: ['int8[]', 'text[]', 'int4[]', 'float8[]'] }))
    }
    await Promise.all(ps)
  })],
  ['bulkUpdate chunk=1000', (u) => mc.bulkUpdate('bub', UCOLS, u as never, { by: 'id', chunk: 1000 })],
]
const res = new Map<string, number[]>(LANES.map(([k]) => [k, []]))
for (const [, run] of LANES) { await sync(); await run(mkU()) } // warmup
for (let round = 0; round < 3; round++) {
  for (const [k, run] of LANES) { await sync(); const u = mkU(); const t0 = performance.now(); await run(u); res.get(k)!.push(performance.now() - t0) }
}
for (const [k] of LANES) {
  const s = [...res.get(k)!].sort((a, b) => a - b)
  console.log(`${k.padEnd(32)} ${Math.round(U / (s[1]! / 1000)).toLocaleString().padStart(10)}/s  (${Math.round(U / (s[2]! / 1000)).toLocaleString()}..${Math.round(U / (s[0]! / 1000)).toLocaleString()})`)
}
await mc.query('drop table bub')
await mc.end()
process.exit(0)
