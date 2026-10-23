// Upsert exploration: semantics probes + throughput bench.
// Lanes: unnest + ON CONFLICT DO UPDATE (the future bulkInsert onConflict), DO NOTHING,
// and COPY-into-temp-staging + one merged upsert. Interleaved rounds + hygiene.
//   bun playground/upserts/upserts.bench.ts
import { connect } from '../../src/index.ts'
const mc = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' })

// ---------- semantics probes ----------
console.log('== semantics ==')
await mc.query('drop table if exists up_sem')
await mc.query('create table up_sem(id int8 primary key, v text)')
await mc.query("insert into up_sem values (1,'old'),(2,'old')")
// 1. duplicate key WITHIN one DO UPDATE statement -> 21000 cardinality violation
try {
  await mc.query(`insert into up_sem select * from unnest($1::int8[],$2::text[]) on conflict (id) do update set v = excluded.v`,
    [[3, 3], ['a', 'b']], { params: ['int8[]', 'text[]'] })
  console.log('dup-in-stmt DO UPDATE: NO ERROR (unexpected)')
} catch (e) { console.log(`dup-in-stmt DO UPDATE: code=${(e as { code?: string }).code} (cardinality violation as expected)`) }
// 2. duplicate key within one DO NOTHING statement -> fine, second skipped
const dn = await mc.query(`insert into up_sem select * from unnest($1::int8[],$2::text[]) on conflict (id) do nothing`,
  [[4, 4], ['a', 'b']], { params: ['int8[]', 'text[]'] })
console.log(`dup-in-stmt DO NOTHING: rowCount=${dn.rowCount} (1 inserted, dup skipped)`)
// 3. rowCount + xmax trick: distinguish inserted vs updated
const up = await mc.query(`insert into up_sem select * from unnest($1::int8[],$2::text[]) on conflict (id) do update set v = excluded.v returning id, (xmax = 0) as inserted`,
  [[1, 5], ['new', 'new']], { params: ['int8[]', 'text[]'] })
console.log(`DO UPDATE mixed batch: rowCount=${up.rowCount}; xmax-trick inserted flags=${JSON.stringify(up.rows.map((r) => (r as unknown[])[1]))}`)
// 4. DO NOTHING rowCount counts ONLY inserts
const dn2 = await mc.query(`insert into up_sem select * from unnest($1::int8[],$2::text[]) on conflict (id) do nothing`,
  [[1, 6], ['x', 'x']], { params: ['int8[]', 'text[]'] })
console.log(`DO NOTHING mixed batch: rowCount=${dn2.rowCount} (conflicting row not counted)`)
await mc.query('drop table up_sem')

// ---------- bench ----------
const N = 1_000_000, U = 100_000
const CT = { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' } as const
await mc.query('drop table if exists upb')
await mc.query('create table upb(id int8 primary key, name text, qty int4, price float8, flag bool, created_at timestamptz)')
const mkRow = (id: number, g: number): Record<string, unknown> => ({ id, name: `g${g}_${id}`, qty: g, price: id + 0.25, flag: id % 2 === 0, created_at: new Date(1767225600000 + (id % 86400) * 1000) })
{
  const rows: Record<string, unknown>[] = new Array(N)
  for (let i = 0; i < N; i++) rows[i] = mkRow(i + 1, 0)
  await mc.copyMany('upb', CT, rows, { chunk: 250_000, atomic: false })
}
let gen = 0
const mkBatch = (conflictPct: number): Record<string, unknown>[] => {
  gen++
  const nConf = Math.floor((U * conflictPct) / 100)
  const out: Record<string, unknown>[] = new Array(U)
  for (let i = 0; i < nConf; i++) out[i] = mkRow(i * 7 + 1, gen)            // existing ids
  for (let i = nConf; i < U; i++) out[i] = mkRow(N + gen * U + i, gen)      // brand-new ids
  return out
}
const COLS = 'id,name,qty,price,flag,created_at'
const SET = ['name', 'qty', 'price', 'flag', 'created_at'].map((c) => `${c} = excluded.${c}`).join(', ')
const UPSERT = `insert into upb(${COLS}) select * from unnest($1::int8[],$2::text[],$3::int4[],$4::float8[],$5::bool[],$6::timestamptz[]) on conflict (id) do update set ${SET}`
const NOTHING = `insert into upb(${COLS}) select * from unnest($1::int8[],$2::text[],$3::int4[],$4::float8[],$5::bool[],$6::timestamptz[]) on conflict (id) do nothing`
const PT = ['int8[]', 'text[]', 'int4[]', 'float8[]', 'bool[]', 'timestamptz[]'] as const
const pivot = (rows: Record<string, unknown>[]): unknown[] => ['id', 'name', 'qty', 'price', 'flag', 'created_at'].map((k) => rows.map((r) => r[k]))
const chunked = (sql: string, name: string) => (rows: Record<string, unknown>[]) => mc.begin(async (tx) => {
  const ps: Promise<unknown>[] = []
  for (let i = 0; i < rows.length; i += 256) ps.push(tx.query(sql, pivot(rows.slice(i, i + 256)), { name, params: PT }))
  await Promise.all(ps)
})
const staging = (rows: Record<string, unknown>[]) => mc.begin(async (tx) => {
  await tx.query('create temp table _st(id int8, name text, qty int4, price float8, flag bool, created_at timestamptz) on commit drop')
  await tx.copyMany('_st', CT, rows)
  await tx.query(`insert into upb select * from _st on conflict (id) do update set ${SET}`)
})
const LANES: [string, (rows: Record<string, unknown>[]) => Promise<unknown>][] = [
  ['unnest ON CONFLICT UPDATE ×256', chunked(UPSERT, 'upx')],
  ['unnest ON CONFLICT NOTHING ×256', chunked(NOTHING, 'upn')],
  ['COPY temp staging + merge', staging],
]
const sync = async () => { await mc.query('delete from upb where id > 1000000'); await mc.query('vacuum upb'); await mc.query('checkpoint'); await Bun.sleep(500) }
for (const pct of [0, 50, 100]) {
  console.log(`\n== upsert ${U.toLocaleString()} rows into 1M-row table · ${pct}% conflicts (median of 3, interleaved) ==`)
  const res = new Map<string, number[]>(LANES.map(([k]) => [k, []]))
  for (const [, run] of LANES) { await sync(); await run(mkBatch(pct)) } // warmup
  for (let round = 0; round < 3; round++) {
    for (const [k, run] of LANES) { await sync(); const b = mkBatch(pct); const t0 = performance.now(); await run(b); res.get(k)!.push(performance.now() - t0) }
  }
  for (const [k] of LANES) {
    const s = [...res.get(k)!].sort((a, b) => a - b)
    console.log(`  ${k.padEnd(34)} ${Math.round(U / (s[1]! / 1000)).toLocaleString().padStart(10)}/s  (${Math.round(U / (s[2]! / 1000)).toLocaleString()}..${Math.round(U / (s[0]! / 1000)).toLocaleString()})`)
  }
}
await mc.query('drop table upb')
await mc.end()
process.exit(0)
