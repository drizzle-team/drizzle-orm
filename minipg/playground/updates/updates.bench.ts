// Bulk UPDATE shapes, measured against a 1M-row table with run hygiene (checkpoint + settle
// before every timed run). All through minipg's public API — the update siblings of the
// insert ladder: pipelined singles, unnest-join, VALUES-join, COPY-temp-join.
//   bun playground/updates/updates.bench.ts
import { connect } from '../../src/index.ts'

const mc = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' })
const BASE = Date.UTC(2026, 0, 1)
const TABLE_N = 1_000_000

console.log('loading 1M-row base table via copyMany…')
await mc.query('drop table if exists upd_bench')
await mc.query('create table upd_bench(id int8 primary key, name text, qty int4, price float8, flag bool, created_at timestamptz)')
{
  const rows: Record<string, unknown>[] = new Array(TABLE_N)
  for (let i = 0; i < TABLE_N; i++) rows[i] = { id: i + 1, name: `n_${i}`, qty: i % 1000, price: i + 0.25, flag: i % 2 === 0, created_at: new Date(BASE + (i % 86400) * 1000) }
  await mc.copyMany('upd_bench', { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' }, rows, { chunk: 250_000, atomic: false })
  await mc.query('vacuum analyze upd_bench')
}

interface Upd { id: number; name: string; qty: number; price: number }
function makeUpdates(n: number, gen: number): Upd[] {
  const step = Math.floor(TABLE_N / n)
  const out: Upd[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = { id: i * step + 1, name: `upd${gen}_${i}`, qty: 1_000_000 + gen, price: i + gen + 0.5, }
  return out
}

const UNNEST = `update upd_bench t set name = u.name, qty = u.qty, price = u.price
  from unnest($1::int8[], $2::text[], $3::int4[], $4::float8[]) as u(id, name, qty, price) where t.id = u.id`
const SINGLE = 'update upd_bench set name = $2, qty = $3, price = $4 where id = $1'
function valuesSql(c: number): string {
  const rows: string[] = new Array(c)
  for (let i = 0; i < c; i++) {
    const b = i * 4
    rows[i] = i === 0 ? `($1::int8,$2::text,$3::int4,$4::float8)` : `($${b + 1},$${b + 2},$${b + 3},$${b + 4})`
  }
  return `update upd_bench t set name = v.name, qty = v.qty, price = v.price from (values ${rows.join(',')}) as v(id, name, qty, price) where t.id = v.id`
}
const VALUES100 = valuesSql(100)

const sync = async () => { await mc.query('checkpoint'); await Bun.sleep(700) }
let gen = 0
type Shape = { name: string; maxN?: number; run: (u: Upd[]) => Promise<void> }
const SHAPES: Shape[] = [
  {
    name: 'pipelined single UPDATEs, one tx', maxN: 10_000,
    run: (u) => mc.begin(async (tx) => {
      const ps = u.map((r) => tx.query(SINGLE, [r.id, r.name, r.qty, r.price], { name: 'u1' }))
      await Promise.all(ps)
    }),
  },
  {
    name: 'unnest-join ×1k chunks, one tx',
    run: (u) => mc.begin(async (tx) => {
      const ps: Promise<unknown>[] = []
      for (let i = 0; i < u.length; i += 1000) {
        const part = u.slice(i, i + 1000)
        ps.push(tx.query(UNNEST, [part.map((r) => r.id), part.map((r) => r.name), part.map((r) => r.qty), part.map((r) => r.price)],
          { name: 'uu', params: ['int8[]', 'text[]', 'int4[]', 'float8[]'] }))
      }
      await Promise.all(ps)
    }),
  },
  {
    name: 'VALUES-join ×100 chunks, one tx',
    run: (u) => mc.begin(async (tx) => {
      const ps: Promise<unknown>[] = []
      for (let i = 0; i + 100 <= u.length; i += 100) {
        const flat: unknown[] = new Array(400)
        for (let j = 0; j < 100; j++) { const r = u[i + j]!, b = j * 4; flat[b] = r.id; flat[b + 1] = r.name; flat[b + 2] = r.qty; flat[b + 3] = r.price }
        ps.push(tx.query(VALUES100, flat, { name: 'uv' }))
      }
      await Promise.all(ps)
    }),
  },
  {
    name: 'COPY temp + one join UPDATE, one tx',
    run: (u) => mc.begin(async (tx) => {
      await tx.query('create temp table _u(id int8, name text, qty int4, price float8) on commit drop')
      await tx.copyMany('_u', { id: 'int8', name: 'text', qty: 'int4', price: 'float8' }, u as unknown as Record<string, unknown>[])
      await tx.query('update upd_bench t set name = _u.name, qty = _u.qty, price = _u.price from _u where t.id = _u.id')
    }),
  },
]

for (const n of [10_000, 100_000]) {
  console.log(`\n== update ${n.toLocaleString()} of ${TABLE_N.toLocaleString()} rows (median of 3) ==`)
  for (const s of SHAPES) {
    if (s.maxN && n > s.maxN) { console.log(`  ${s.name.padEnd(36)} skipped`); continue }
    await sync(); await s.run(makeUpdates(n, ++gen)) // warmup
    const times: number[] = []
    for (let r = 0; r < 3; r++) {
      const u = makeUpdates(n, ++gen)
      await sync()
      const t0 = performance.now()
      await s.run(u)
      times.push(performance.now() - t0)
    }
    const chk = await mc.query('select count(*)::int4 from upd_bench where qty >= 1000000')
    if (((chk.rows[0] as unknown as number[])[0] ?? 0) !== n) throw new Error(`${s.name}: expected ${n} updated`)
    const ms = [...times].sort((a, b) => a - b)[1]!
    console.log(`  ${s.name.padEnd(36)} ${ms.toFixed(1).padStart(9)} ms   ${Math.round(n / (ms / 1000)).toLocaleString().padStart(10)} rows/s`)
  }
}
await mc.query('drop table upd_bench')
await mc.end()
process.exit(0)
