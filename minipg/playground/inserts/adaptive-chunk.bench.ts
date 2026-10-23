// Fixed chunk=256 vs the adaptive formula (per-batch: cells & bytes constraints from sampled
// rows) vs the measured-optimum oracle. Interleaved rounds per shape + hygiene.
//   bun playground/inserts/adaptive-chunk.bench.ts
import { connect } from '../../src/index.ts'
const mc = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.5432'.replace('5432', '54329'), user: 'postgres', database: 'testdb' })
const sync = async () => { await mc.query('checkpoint'); await Bun.sleep(600) }

// the proposed adaptive default — computed PER BATCH from the actual rows
function adaptiveChunk(ncols: number, rows: readonly Record<string, unknown>[], names: readonly string[]): number {
  const idxs = rows.length <= 4 ? rows.map((_, i) => i) : [0, Math.floor(rows.length / 3), Math.floor((2 * rows.length) / 3), rows.length - 1]
  let est = 0
  for (const i of idxs) {
    const r = rows[i]!
    let b = 24
    for (const k of names) { const v = r[k]; b += typeof v === 'string' ? v.length + 4 : v instanceof Uint8Array ? v.byteLength + 4 : 12 }
    est += b
  }
  est /= idxs.length
  return Math.max(16, Math.min(Math.ceil(1024 / ncols), Math.max(16, Math.floor(32768 / est)), 2048))
}

interface Shape { key: string; n: number; ddl: string; cols: Record<string, string>; mk: (i: number) => Record<string, unknown>; oracle: number }
const LONG = 'x'.repeat(120)
const SHAPES: Shape[] = [
  { key: 'narrow (2 cols)', n: 1_000_000, ddl: 'create table ac(id int8 primary key, v int4)', cols: { id: 'int8', v: 'int4' }, mk: (i) => ({ id: i + 1, v: i | 0 }), oracle: 512 },
  { key: 'standard (6 cols)', n: 500_000, ddl: 'create table ac(id int8 primary key, name text, qty int4, price float8, flag bool, created_at timestamptz)', cols: { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' }, mk: (i) => ({ id: i + 1, name: `n_${i}`, qty: i % 1000, price: i + 0.25, flag: i % 2 === 0, created_at: new Date(1767225600000 + (i % 86400) * 1000) }), oracle: 128 },
  { key: 'wide (24 cols)', n: 250_000, ddl: 'create table ac(id int8 primary key, ' + Array.from({ length: 11 }, (_, k) => `i${k} int4`).join(',') + ',' + Array.from({ length: 8 }, (_, k) => `f${k} float8`).join(',') + ',' + Array.from({ length: 4 }, (_, k) => `t${k} text`).join(',') + ')', cols: Object.fromEntries([['id', 'int8'], ...Array.from({ length: 11 }, (_, k) => [`i${k}`, 'int4']), ...Array.from({ length: 8 }, (_, k) => [`f${k}`, 'float8']), ...Array.from({ length: 4 }, (_, k) => [`t${k}`, 'text'])]) as Record<string, string>, mk: (i) => { const r: Record<string, unknown> = { id: i + 1 }; for (let k = 0; k < 11; k++) r[`i${k}`] = i + k; for (let k = 0; k < 8; k++) r[`f${k}`] = i + k + 0.5; for (let k = 0; k < 4; k++) r[`t${k}`] = `w${k}_${i}`; return r }, oracle: 64 },
  { key: 'fat-text (6 cols)', n: 150_000, ddl: 'create table ac(id int8 primary key, a text, b text, c text, d text, e text)', cols: { id: 'int8', a: 'text', b: 'text', c: 'text', d: 'text', e: 'text' }, mk: (i) => ({ id: i + 1, a: LONG + i, b: LONG + i, c: LONG + i, d: LONG + i, e: LONG + i }), oracle: 64 },
]

for (const sh of SHAPES) {
  const names = Object.keys(sh.cols)
  const rows: Record<string, unknown>[] = new Array(sh.n)
  for (let i = 0; i < sh.n; i++) rows[i] = sh.mk(i)
  const formula = adaptiveChunk(names.length, rows, names)
  await mc.query('drop table if exists ac'); await mc.query(sh.ddl)
  const LANES: [string, number][] = [[`fixed 256`, 256], [`formula (${formula})`, formula], [`oracle (${sh.oracle})`, sh.oracle]]
  console.log(`\n== ${sh.key} · ${sh.n.toLocaleString()} rows ==`)
  const res = new Map<string, number[]>(LANES.map(([k]) => [k, []]))
  for (const [, c] of LANES) { await mc.query('truncate ac'); await sync(); await mc.bulkInsert('ac', sh.cols as never, rows, { chunk: c }) }
  for (let round = 0; round < 3; round++) {
    for (const [k, c] of LANES) {
      await mc.query('truncate ac'); await sync()
      const t0 = performance.now(); await mc.bulkInsert('ac', sh.cols as never, rows, { chunk: c }); res.get(k)!.push(performance.now() - t0)
    }
  }
  for (const [k] of LANES) {
    const s = [...res.get(k)!].sort((a, b) => a - b)
    console.log(`  ${k.padEnd(16)} ${Math.round(sh.n / (s[1]! / 1000)).toLocaleString().padStart(10)}/s   (${Math.round(sh.n / (s[2]! / 1000)).toLocaleString()}..${Math.round(sh.n / (s[0]! / 1000)).toLocaleString()})`)
  }
}
await mc.query('drop table if exists ac')
await mc.end()
process.exit(0)
