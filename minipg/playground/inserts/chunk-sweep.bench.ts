// bulkInsert chunk-size sweep: find the default sweet spot. Hygiene: checkpoint + settle
// before every timed run; median of 3 with min..max spread so noise is visible.
//   bun playground/inserts/chunk-sweep.bench.ts
import { connect } from '../../src/index.ts'

const mc = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' })
await mc.query('drop table if exists csw')
await mc.query('create table csw(id int8 primary key, name text, qty int4, price float8, flag bool, created_at timestamptz)')
const CT = { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' } as const
const BASE = Date.UTC(2026, 0, 1)
const mk = (n: number): Record<string, unknown>[] => {
  const rows: Record<string, unknown>[] = new Array(n)
  for (let i = 0; i < n; i++) rows[i] = { id: i + 1, name: `n_${i}`, qty: i % 1000, price: i + 0.25, flag: i % 2 === 0, created_at: new Date(BASE + (i % 86400) * 1000) }
  return rows
}
const sync = async () => { await mc.query('checkpoint'); await Bun.sleep(700) }

const CHUNKS = [250, 500, 1_000, 2_000, 5_000, 10_000]
const SIZES = [10_000, 100_000, 1_000_000]
for (const n of SIZES) {
  const rows = mk(n)
  console.log(`\n== ${n.toLocaleString()} rows (median of 3, spread = min..max) ==`)
  for (const chunk of CHUNKS) {
    await mc.query('truncate csw'); await sync(); await mc.bulkInsert('csw', CT, rows, { chunk }) // warmup
    const times: number[] = []
    for (let r = 0; r < 3; r++) {
      await mc.query('truncate csw'); await sync()
      const t0 = performance.now(); await mc.bulkInsert('csw', CT, rows, { chunk }); times.push(performance.now() - t0)
    }
    const c = await mc.query('select count(*)::int4 from csw')
    if ((c.rows[0] as unknown as number[])[0] !== n) throw new Error(`chunk ${chunk}: bad count`)
    const s = [...times].sort((a, b) => a - b)
    const rps = (ms: number) => Math.round(n / (ms / 1000))
    console.log(`  chunk=${String(chunk).padEnd(6)} ${rps(s[1]!).toLocaleString().padStart(10)}/s   (${rps(s[2]!).toLocaleString()}..${rps(s[0]!).toLocaleString()})`)
  }
}
await mc.query('drop table csw')
await mc.end()
process.exit(0)
