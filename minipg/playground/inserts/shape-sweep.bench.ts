// Does the optimal bulkInsert chunk depend on row WIDTH? Sweep chunk sizes across four table
// shapes (2-col narrow, 6-col standard, 24-col wide, fat-text). INTERLEAVED rounds within each
// shape (drift-proof) + checkpoint hygiene. If the optimum tracks cells-or-bytes/statement
// rather than rows/statement, the default should be adaptive.
//   bun playground/inserts/shape-sweep.bench.ts
import { connect } from '../../src/index.ts'
const mc = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' })
const sync = async () => { await mc.query('checkpoint'); await Bun.sleep(600) }
const CHUNKS = [32, 64, 128, 256, 512, 1024, 4096]

interface Shape { key: string; n: number; ddl: string; cols: Record<string, string>; mk: (i: number) => Record<string, unknown>; bytes: number }
const LONG = 'x'.repeat(120)
const SHAPES: Shape[] = [
  {
    key: 'narrow (2 cols, ~14B/row)', n: 1_000_000,
    ddl: 'create table ss(id int8 primary key, v int4)',
    cols: { id: 'int8', v: 'int4' },
    mk: (i) => ({ id: i + 1, v: i | 0 }), bytes: 14,
  },
  {
    key: 'standard (6 cols, ~60B/row)', n: 500_000,
    ddl: 'create table ss(id int8 primary key, name text, qty int4, price float8, flag bool, created_at timestamptz)',
    cols: { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' },
    mk: (i) => ({ id: i + 1, name: `n_${i}`, qty: i % 1000, price: i + 0.25, flag: i % 2 === 0, created_at: new Date(1767225600000 + (i % 86400) * 1000) }), bytes: 60,
  },
  {
    key: 'wide (24 cols, ~150B/row)', n: 250_000,
    ddl: 'create table ss(id int8 primary key, ' + Array.from({ length: 11 }, (_, k) => `i${k} int4`).join(',') + ',' + Array.from({ length: 8 }, (_, k) => `f${k} float8`).join(',') + ',' + Array.from({ length: 4 }, (_, k) => `t${k} text`).join(',') + ')',
    cols: Object.fromEntries([['id', 'int8'], ...Array.from({ length: 11 }, (_, k) => [`i${k}`, 'int4']), ...Array.from({ length: 8 }, (_, k) => [`f${k}`, 'float8']), ...Array.from({ length: 4 }, (_, k) => [`t${k}`, 'text'])]) as Record<string, string>,
    mk: (i) => { const r: Record<string, unknown> = { id: i + 1 }; for (let k = 0; k < 11; k++) r[`i${k}`] = i + k; for (let k = 0; k < 8; k++) r[`f${k}`] = i + k + 0.5; for (let k = 0; k < 4; k++) r[`t${k}`] = `w${k}_${i}`; return r }, bytes: 150,
  },
  {
    key: 'fat-text (6 cols, ~640B/row)', n: 150_000,
    ddl: 'create table ss(id int8 primary key, a text, b text, c text, d text, e text)',
    cols: { id: 'int8', a: 'text', b: 'text', c: 'text', d: 'text', e: 'text' },
    mk: (i) => ({ id: i + 1, a: LONG + i, b: LONG + i, c: LONG + i, d: LONG + i, e: LONG + i }), bytes: 640,
  },
]

for (const sh of SHAPES) {
  const ncols = Object.keys(sh.cols).length
  const rows: Record<string, unknown>[] = new Array(sh.n)
  for (let i = 0; i < sh.n; i++) rows[i] = sh.mk(i)
  await mc.query('drop table if exists ss')
  await mc.query(sh.ddl)
  console.log(`\n== ${sh.key} · ${sh.n.toLocaleString()} rows (median of 3, interleaved) ==`)
  const results = new Map<number, number[]>(CHUNKS.map((c) => [c, []]))
  for (const c of CHUNKS) { await mc.query('truncate ss'); await sync(); await mc.bulkInsert('ss', sh.cols as never, rows, { chunk: c }) } // warmup all
  for (let round = 0; round < 3; round++) {
    for (const c of CHUNKS) {
      await mc.query('truncate ss'); await sync()
      const t0 = performance.now(); await mc.bulkInsert('ss', sh.cols as never, rows, { chunk: c }); results.get(c)!.push(performance.now() - t0)
    }
  }
  for (const c of CHUNKS) {
    const s = [...results.get(c)!].sort((a, b) => a - b)
    const rps = Math.round(sh.n / (s[1]! / 1000))
    console.log(`  chunk=${String(c).padEnd(5)} cells/stmt=${String(c * ncols).padEnd(7)} ~KB/stmt=${String(Math.round(c * sh.bytes / 1024)).padEnd(5)} ${rps.toLocaleString().padStart(10)}/s`)
  }
}
await mc.query('drop table if exists ss')
await mc.end()
process.exit(0)
