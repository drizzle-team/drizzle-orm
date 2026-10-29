// Idle-connection eviction + the attachDatabasePool() detection surface (options.idleTimeoutMillis +
// 'release' event). Requires the local cluster (`bun run test:setup`).
import { test, expect, describe, afterEach } from 'bun:test'
import { createPool } from '../../src/index.ts'

const CFG = { host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb' }
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
let pools: Array<ReturnType<typeof createPool>> = []
afterEach(async () => { for (const p of pools) await p.end().catch(() => {}); pools = [] })
const mk = (extra = {}) => { const p = createPool({ ...CFG, ...extra }); pools.push(p); return p }

describe('pool idle timeout', () => {
  test('evicts a connection idle longer than idleTimeoutMillis', async () => {
    const pool = mk({ idleTimeoutMillis: 150, max: 2 })
    await pool.query('select 1')          // opens + releases a connection
    expect(pool.idleCount).toBe(1)
    await sleep(300)
    expect(pool.idleCount).toBe(0)         // evicted
    expect(pool.size).toBe(0)              // and dropped from the pool
    const r = await pool.query('select 2 as n', [], { mode: 'object' }) // still usable (reopens)
    expect(r.rows[0] as unknown).toEqual({ n: 2 })
  })

  test('default (no idleTimeoutMillis) never evicts — behavior preserved', async () => {
    const pool = mk({ max: 2 })
    await pool.query('select 1')
    expect(pool.idleCount).toBe(1)
    await sleep(250)
    expect(pool.idleCount).toBe(1)         // still there
    expect(pool.options.idleTimeoutMillis).toBe(0)
  })

  test('re-checkout before the timeout cancels eviction', async () => {
    const pool = mk({ idleTimeoutMillis: 200, max: 1 })
    await pool.query('select 1')
    await sleep(80)
    await pool.query('select 1')           // reuse resets idleness
    await sleep(160)                        // 80+160 > 200, but the timer was cleared on reuse
    expect(pool.idleCount).toBe(1)          // not evicted (only 160ms idle since last use)
  })
})

describe('attachDatabasePool() compatibility', () => {
  test("'release' event fires on release", async () => {
    const pool = mk({ idleTimeoutMillis: 1000 })
    let releases = 0
    pool.on('release', () => { releases++ })
    await pool.query('select 1')
    await pool.query('select 1')
    expect(releases).toBe(2)
  })

  test('matches the pg duck-type branch (would not throw "Unsupported")', () => {
    const pool = mk({ idleTimeoutMillis: 5000 })
    // replicate @vercel/functions attachDatabasePool pg detection
    const detectedAsPg = 'on' in pool && typeof (pool as { on?: unknown }).on === 'function'
      && 'options' in pool && !!pool.options && 'idleTimeoutMillis' in pool.options
    expect(detectedAsPg).toBe(true)
    expect(pool.options.idleTimeoutMillis).toBe(5000)
  })
})
