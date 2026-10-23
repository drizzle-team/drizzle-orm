// Connection pool (src/pool.ts) integration + unit tests.
// Domain: "pool". Grounded in the ACTUAL current source, which is hardened beyond
// the original plan (double-release is a no-op via the `out` set, end() rejects
// parked waiters, an open/failed tx is ROLLBACK'd before reuse). Tests assert what
// the driver really does; genuinely-unimplemented features are test.todo.
//
// ISOLATION: public.t is read-only. Every write uses a CONNECTION-SCOPED temp table.
// Each pool gets a UNIQUE applicationName so pg_stat_activity counts only our own
// backends (other suites run concurrently with the default 'minipg' app name).
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect, testPool, caught, PgError } from '../helpers/db.ts'
import type { Connection } from '../../src/index.ts'

let uid = 0
const appName = () => `pooltest_${process.pid}_${Date.now()}_${uid++}`

// A dedicated side connection (distinct app name) used to observe backend counts
// and to terminate victims for chaos tests.
let side: Connection
beforeAll(async () => { side = await testConnect({ applicationName: `pooltest_side_${process.pid}` }) })
afterAll(async () => { await side.end() })

async function backendCount(app: string): Promise<number> {
  const r = await side.query(
    'select count(*)::int from pg_stat_activity where datname = current_database() and application_name = $1',
    [app],
  )
  return (r.rows[0] as unknown[])[0] as number
}

async function waitFor(pred: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

const pid = async (c: Connection): Promise<number> =>
  (await c.query('select pg_backend_pid()').then((r) => (r.rows[0] as unknown[])[0])) as number

describe('lazy open & idle reuse', () => {
  test('fresh pool has zeroed stats; first acquire opens exactly one backend', async () => {
    const app = appName()
    const pool = testPool({ max: 5, applicationName: app })
    try {
      expect(pool.size).toBe(0)
      expect(pool.idleCount).toBe(0)
      expect(pool.waiting).toBe(0)
      expect(await backendCount(app)).toBe(0)

      const c = await pool.acquire()
      expect(pool.size).toBe(1)
      expect(pool.idleCount).toBe(0)
      expect(await backendCount(app)).toBe(1)
      pool.release(c)
      expect(pool.idleCount).toBe(1)
    } finally {
      await pool.end()
    }
  })

  test('acquire/release/acquire reuses the SAME physical backend; idleCount restored', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    try {
      const c1 = await pool.acquire()
      const p1 = await pid(c1)
      pool.release(c1)
      expect(pool.idleCount).toBe(1)

      const c2 = await pool.acquire()
      const p2 = await pid(c2)
      expect(p2).toBe(p1) // same backend reused
      expect(pool.idleCount).toBe(0)
      pool.release(c2)
      expect(pool.idleCount).toBe(1)
    } finally {
      await pool.end()
    }
  })

  test('acquire with no query then release returns to idle; repeated on max:3 never hangs', async () => {
    const app = appName()
    const pool = testPool({ max: 3, applicationName: app })
    try {
      for (let i = 0; i < 8; i++) {
        const c = await pool.acquire() // no query run
        pool.release(c)
      }
      expect(pool.size).toBeLessThanOrEqual(3)
      expect(pool.idleCount).toBe(1) // serial reuse keeps a single idle conn
      expect(await backendCount(app)).toBeLessThanOrEqual(3)
    } finally {
      await pool.end()
    }
  })

  test('idle reuse order is LIFO (idle.pop())', async () => {
    const pool = testPool({ max: 3, applicationName: appName() })
    try {
      const a = await pool.acquire(); const b = await pool.acquire(); const c = await pool.acquire()
      const pa = await pid(a), pb = await pid(b), pc = await pid(c)
      pool.release(a); pool.release(b); pool.release(c) // idle = [a,b,c]
      const x = await pool.acquire(); const y = await pool.acquire(); const z = await pool.acquire()
      expect(await pid(x)).toBe(pc)
      expect(await pid(y)).toBe(pb)
      expect(await pid(z)).toBe(pa)
      pool.release(x); pool.release(y); pool.release(z)
    } finally {
      await pool.end()
    }
  })

  test('pool.query on empty pool opens one conn and releases it; second reuses it', async () => {
    const app = appName()
    const pool = testPool({ max: 5, applicationName: app })
    try {
      const r1 = await pool.query('select 1')
      expect((r1.rows[0] as unknown as unknown[])[0]).toBe(1)
      expect(pool.size).toBe(1)
      expect(pool.idleCount).toBe(1)

      await pool.query('select 2')
      expect(pool.size).toBe(1) // reused, not grown
      expect(await backendCount(app)).toBe(1)
    } finally {
      await pool.end()
    }
  })

  test('pool.query releases on all paths: zero-row and erroring query', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    try {
      const zero = await pool.query('select 1 where false')
      expect(zero.rows.length).toBe(0)
      expect(pool.idleCount).toBe(1)

      const err = await caught(() => pool.query('select * from no_such_table_xyz'))
      expect((err as PgError).code).toBe('42P01')
      expect(pool.idleCount).toBe(1) // released despite the error
      expect(pool.size).toBe(1)

      // repeated calls never grow beyond max
      for (let i = 0; i < 6; i++) await pool.query('select 1')
      expect(pool.size).toBeLessThanOrEqual(2)
    } finally {
      await pool.end()
    }
  })
})

describe('max bound & FIFO waiter queue', () => {
  test('max:3, 5 concurrent pool.query all resolve correctly; size<=3', async () => {
    const pool = testPool({ max: 3, applicationName: appName() })
    try {
      const results = await Promise.all(
        [0, 1, 2, 3, 4].map((i) => pool.query('select $1::int as v', [i])),
      )
      const vals = results.map((r) => (r.rows[0] as unknown as unknown[])[0])
      expect(vals).toEqual([0, 1, 2, 3, 4])
      expect(pool.size).toBeLessThanOrEqual(3)
    } finally {
      await pool.end()
    }
  })

  for (const max of [1, 3]) {
    test(`max:${max}, N+M concurrent connect(): N resolve, M park then resolve on release`, async () => {
      const app = appName()
      const pool = testPool({ max, applicationName: app })
      try {
        const M = 2
        const handles = Array.from({ length: max + M }, () => pool.connect())
        // give the first `max` time to resolve
        const first = await Promise.all(handles.slice(0, max))
        await waitFor(() => pool.waiting === M)
        expect(pool.waiting).toBe(M)
        expect(pool.size).toBe(max) // never opened an (max+1)th backend
        expect(await backendCount(app)).toBe(max)

        // release the first batch; the parked ones resolve. Resolve them
        // sequentially (with max:1 only one slot frees at a time).
        for (const h of first) h.release()
        for (const hp of handles.slice(max)) {
          const h = await hp
          const r = await h.client.query('select 1')
          expect((r.rows[0] as unknown[])[0]).toBe(1)
          h.release()
        }
        expect(pool.size).toBe(max)
      } finally {
        await pool.end()
      }
    })
  }

  test('FIFO fairness: parked waiters resolve in submission order', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    try {
      const held = await pool.connect() // occupies the only slot
      const order: number[] = []
      const K = 5
      const waiters = Array.from({ length: K }, (_, i) =>
        pool.acquire().then((c) => { order.push(i); return c }),
      )
      await waitFor(() => pool.waiting === K)

      // release one at a time; each frees exactly one waiter, in order
      held.release()
      for (let i = 0; i < K; i++) {
        const c = await waiters[i]!
        pool.release(c)
      }
      expect(order).toEqual([0, 1, 2, 3, 4])
    } finally {
      await pool.end()
    }
  })

  test('full pool: releasing one client immediately hands the conn to the oldest waiter', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    try {
      const a = await pool.acquire()
      const waiterP = pool.acquire()
      await waitFor(() => pool.waiting === 1)
      pool.release(a) // no idle slot exists; must hand directly to the waiter
      const b = await waiterP
      const r = await b.query('select 42')
      expect((r.rows[0] as unknown[])[0]).toBe(42)
      pool.release(b)
    } finally {
      await pool.end()
    }
  })

  test('backend-count invariant: 200 queries through max:5 never exceeds 5 backends', async () => {
    const app = appName()
    const pool = testPool({ max: 5, applicationName: app })
    let peak = 0
    try {
      await Promise.all(
        Array.from({ length: 200 }, async (_, i) => {
          const r = await pool.query('select $1::int', [i])
          peak = Math.max(peak, pool.size)
          return r
        }),
      )
      expect(peak).toBeLessThanOrEqual(5)
      expect(pool.size).toBeLessThanOrEqual(5)
      expect(await backendCount(app)).toBeLessThanOrEqual(5)
    } finally {
      await pool.end()
    }
  })

  test('leak simulation: holding max clients parks the next acquire; releasing unblocks it', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    try {
      const h1 = await pool.connect()
      const h2 = await pool.connect()
      let resolved = false
      const parked = pool.acquire().then((c) => { resolved = true; return c })
      await waitFor(() => pool.waiting === 1)
      expect(resolved).toBe(false) // still parked, leaked clients never released

      h1.release()
      const c = await parked
      expect(resolved).toBe(true)
      const r = await c.query('select 1')
      expect((r.rows[0] as unknown[])[0]).toBe(1)
      pool.release(c)
      h2.release()
    } finally {
      await pool.end()
    }
  })
})

describe('release & checkout correctness', () => {
  test('releasing inside a .then() chain still delivers the result downstream', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    try {
      const out = await pool
        .query('select 7 as v') // implicit release happens in finally
        .then((r) => (r.rows[0] as unknown as unknown[])[0])
        .then((v) => (v as number) * 2)
      expect(out).toBe(14)
      expect(pool.idleCount).toBe(1)
    } finally {
      await pool.end()
    }
  })

  test('connect() client held across BEGIN/.../ROLLBACK stays on the SAME backend', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    try {
      const { client, release } = await pool.connect()
      const p0 = await pid(client)
      await client.query('begin')
      await client.query('create temp table tx_probe(i int)')
      await client.query('insert into tx_probe values (1)')
      expect(client.inTransaction).toBe(true)
      const p1 = await pid(client)
      expect(p1).toBe(p0) // not auto-returned mid-transaction
      await client.query('rollback')
      expect(client.inTransaction).toBe(false)
      expect(await pid(client)).toBe(p0)
      release()
    } finally {
      await pool.end()
    }
  })

  test('client.end() directly then release(): conn removed from pool, not re-added to idle', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    try {
      const { client, release } = await pool.connect()
      expect(pool.size).toBe(1)
      await client.end() // close it out from under the pool
      expect(client.state).toBe('closed')
      release() // sees state==='closed' -> deletes from all, does NOT enter idle
      expect(pool.idleCount).toBe(0)
      expect(pool.size).toBe(0)
      // pool still serves new queries
      const r = await pool.query('select 1')
      expect((r.rows[0] as unknown as unknown[])[0]).toBe(1)
    } finally {
      await pool.end()
    }
  })

  // The `out` set makes a second release a no-op (covered in regression.test.ts for
  // acquire; here we pin the pool.connect() closure variant).
  test('connect() release() called twice is idempotent (no idle inflation)', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    try {
      const { release } = await pool.connect()
      release(); release() // second is a no-op
      expect(pool.idleCount).toBe(1)
      expect(pool.size).toBe(1)
    } finally {
      await pool.end()
    }
  })

  test.todo('query on a client AFTER release() must reject (no release-token guard exists today)', () => {})
  test.todo('release(true) destroy-flag closes the conn and opens a replacement on next acquire', () => {})
})

describe('dead-connection eviction & refill', () => {
  test('backend killed mid-checkout is evicted on release; pool serves new queries', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    try {
      const { client, release } = await pool.connect()
      const victim = await pid(client)
      expect(pool.size).toBe(1)

      await side.query('select pg_terminate_backend($1)', [victim])
      await waitFor(() => client.state === 'closed')

      release() // closed -> removed from all (not idle)
      expect(pool.idleCount).toBe(0)
      expect(pool.size).toBe(0)

      const r = await pool.query('select 1') // fresh backend opened
      expect((r.rows[0] as unknown as unknown[])[0]).toBe(1)
      expect(pool.size).toBe(1)
    } finally {
      await pool.end()
    }
  })

  test('max:1 reborn: kill the single backend, release, a parked waiter gets a fresh conn', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    try {
      const { client, release } = await pool.connect()
      const victim = await pid(client)
      const waiterP = pool.acquire()
      await waitFor(() => pool.waiting === 1)

      await side.query('select pg_terminate_backend($1)', [victim])
      await waitFor(() => client.state === 'closed')

      release() // closed -> refill() opens a replacement for the waiter
      const fresh = await waiterP
      expect(fresh.state).toBe('ready')
      const freshPid = await pid(fresh)
      expect(freshPid).not.toBe(victim)
      pool.release(fresh)
    } finally {
      await pool.end()
    }
  })

  test('recoverable statement error (23505) leaves the SAME client usable', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    try {
      const { client, release } = await pool.connect()
      const p0 = await pid(client)
      await client.query('create temp table uq(id int primary key)')
      await client.query('insert into uq values (1)')
      const err = await caught(() => client.query('insert into uq values (1)'))
      expect((err as PgError).code).toBe('23505')
      // same backend, still ready
      const r = await client.query('select count(*)::int from uq')
      expect((r.rows[0] as unknown[])[0]).toBe(1)
      expect(await pid(client)).toBe(p0)
      release()
    } finally {
      await pool.end()
    }
  })

  test('aborted-transaction state is rolled back before reuse (no in_failed_sql_transaction leak)', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    try {
      const h1 = await pool.connect()
      await h1.client.query('begin')
      await caught(() => h1.client.query('select * from no_such_table_xyz')) // -> txStatus 'E'
      expect(h1.client.inTransaction).toBe(true)
      h1.release() // failed tx -> ROLLBACK on release

      const h2 = await pool.connect() // same physical conn (max=1)
      expect(h2.client.inTransaction).toBe(false)
      const r = await h2.client.query('select 1') // not stuck in a failed tx
      expect((r.rows[0] as unknown[])[0]).toBe(1)
      h2.release()
    } finally {
      await pool.end()
    }
  })
})

describe('graceful shutdown (pool.end)', () => {
  test('after end() there are zero backends for the app; size/idleCount zeroed', async () => {
    const app = appName()
    const pool = testPool({ max: 3, applicationName: app })
    await pool.query('select 1')
    await pool.acquire().then((c) => pool.release(c))
    expect(pool.size).toBeGreaterThanOrEqual(1)
    await pool.end()
    expect(pool.size).toBe(0)
    expect(pool.idleCount).toBe(0)
    await new Promise((r) => setTimeout(r, 50)) // let the server reflect the closed sockets
    expect(await backendCount(app)).toBe(0)
  })

  test('acquire / query / connect after end() reject with "pool is closed"', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    await pool.end()
    const e1 = await caught(() => pool.acquire())
    const e2 = await caught(() => pool.query('select 1'))
    const e3 = await caught(() => pool.connect())
    for (const e of [e1, e2, e3]) expect((e as Error).message).toMatch(/pool is closed/)
  })

  test('end() is idempotent', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    await pool.query('select 1')
    await pool.end()
    await pool.end() // resolves without throwing
    expect(pool.size).toBe(0)
  })

  test('end() always resolves: only-idle conns present', async () => {
    const pool = testPool({ max: 3, applicationName: appName() })
    await Promise.all([pool.query('select 1'), pool.query('select 2'), pool.query('select 3')])
    expect(pool.idleCount).toBeGreaterThan(0)
    await pool.end() // no hang
    expect(pool.size).toBe(0)
  })

  test('end() always resolves with more queued queries than max (mid-flight cut off)', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    // Warm up two READY conns first; ending a still-connecting conn is a separate
    // (known) edge. Here we exercise the queued/in-flight path against live conns.
    await Promise.all([pool.query('select 1'), pool.query('select 2')])
    expect(pool.idleCount).toBe(2)
    // fire more queries than capacity; some will be in-flight / queued at end()
    const inflight = Array.from({ length: 6 }, (_, i) =>
      caught(() => pool.query('select pg_sleep(0.3), $1::int', [i])),
    )
    await waitFor(() => pool.waiting > 0)
    await pool.end() // must resolve, not hang
    expect(pool.size).toBe(0)
    // cut-off queries settle (resolve or reject) — never hang
    const settled = await Promise.all(inflight)
    expect(settled.length).toBe(6)
  })

  test('end() rejects a connect() parked waiting for a slot (not silently dropped)', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    const held = await pool.acquire()
    void held
    const parked = caught(() => pool.connect())
    await waitFor(() => pool.waiting === 1)
    await pool.end()
    expect(await parked).toBeInstanceOf(Error)
  })

  test.todo('end({drain}) finishes queued queries before closing (drain semantics not implemented)', () => {})
  test.todo('pool emits an "end" event on shutdown (no event API today)', () => {})
})

describe('dedicated client (pool.connect)', () => {
  test('connect() runs multiple SEQUENTIAL queries on the SAME backend; capacity drops by one', async () => {
    const pool = testPool({ max: 3, applicationName: appName() })
    try {
      const before = pool.size
      const { client, release } = await pool.connect()
      expect(pool.size).toBe(before + 1)
      const p0 = await pid(client)
      for (let i = 0; i < 4; i++) {
        const r = await client.query('select pg_backend_pid()')
        expect((r.rows[0] as unknown[])[0]).toBe(p0)
      }
      release()
      expect(pool.idleCount).toBe(1)
    } finally {
      await pool.end()
    }
  })

  test('after connect()+release() the backend is reused and end() does not hang', async () => {
    const pool = testPool({ max: 2, applicationName: appName() })
    const { client, release } = await pool.connect()
    const p0 = await pid(client)
    release()
    const { client: c2, release: r2 } = await pool.connect()
    expect(await pid(c2)).toBe(p0)
    r2()
    await pool.end() // does not hang on the released conn
    expect(pool.size).toBe(0)
  })

  test('a reserved client that ran NO prior query still resolves and releases cleanly', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    try {
      const { release } = await pool.connect() // no query
      release()
      expect(pool.idleCount).toBe(1)
      const r = await pool.query('select 1')
      expect((r.rows[0] as unknown as unknown[])[0]).toBe(1)
    } finally {
      await pool.end()
    }
  })
})

describe('connect-error propagation', () => {
  test('unreachable backend: acquire() rejects and the failed conn is not retained', async () => {
    const pool = testPool({ port: 59999, reconnect: false, applicationName: appName() })
    try {
      const err = await caught(() => pool.acquire())
      expect(err).toBeInstanceOf(Error)
      expect(pool.size).toBe(0) // open() catch deleted it from `all`
      // a second attempt also rejects cleanly (pool not crashed)
      const err2 = await caught(() => pool.query('select 1'))
      expect(err2).toBeInstanceOf(Error)
      expect(pool.size).toBe(0)
    } finally {
      await pool.end()
    }
  })

  test('failed acquire surfaces the error once as a catchable rejection (no crash)', async () => {
    const pool = testPool({ port: 59999, reconnect: false, applicationName: appName() })
    try {
      const errs = await Promise.all([
        caught(() => pool.acquire()),
        caught(() => pool.acquire()),
      ])
      for (const e of errs) expect(e).toBeInstanceOf(Error)
    } finally {
      await pool.end()
    }
  })

  test('after a connect failure the pool still works against the reachable server', async () => {
    const app = appName()
    const bad = testPool({ port: 59999, reconnect: false, applicationName: app })
    await caught(() => bad.acquire())
    expect(bad.size).toBe(0)
    await bad.end()
    // a properly-configured pool succeeds
    const good = testPool({ applicationName: app })
    try {
      const r = await good.query('select 1')
      expect((r.rows[0] as unknown as unknown[])[0]).toBe(1)
    } finally {
      await good.end()
    }
  })

  test.todo('refill() open-failure must eventually reject/retry the parked waiter (currently can wedge)', () => {})
})

describe('size / max configuration', () => {
  test('max undefined falls back to default 10', async () => {
    const app = appName()
    const pool = testPool({ applicationName: app }) // no max -> 10
    try {
      // hold 10 concurrent clients; an 11th must park
      const held = await Promise.all(Array.from({ length: 10 }, () => pool.connect()))
      expect(pool.size).toBe(10)
      let resolved11 = false
      const eleventh = pool.acquire().then((c) => { resolved11 = true; return c })
      await waitFor(() => pool.waiting === 1)
      expect(resolved11).toBe(false)
      expect(await backendCount(app)).toBe(10) // never opened an 11th
      held[0]!.release()
      const c = await eleventh
      pool.release(c)
      for (const h of held.slice(1)) h.release()
    } finally {
      await pool.end()
    }
  })

  test('explicit max:N is honored: never more than N backends opened under load', async () => {
    const app = appName()
    const pool = testPool({ max: 4, applicationName: app })
    let peak = 0
    try {
      await Promise.all(Array.from({ length: 30 }, async (_, i) => {
        await pool.query('select pg_sleep(0.02), $1::int', [i])
        peak = Math.max(peak, await backendCount(app))
      }))
      expect(peak).toBeLessThanOrEqual(4)
    } finally {
      await pool.end()
    }
  })

  test.todo('min keeps that many idle conns established (no min support today)', () => {})
  test.todo('max:0 / disable-pooling semantics (config.max ?? 10 treats 0 as 0 -> would hang)', () => {})
})

describe('observability (stats)', () => {
  test('size/idleCount/waiting are numbers that track state', async () => {
    const pool = testPool({ max: 3, applicationName: appName() })
    try {
      expect(typeof pool.size).toBe('number')
      expect(typeof pool.idleCount).toBe('number')
      expect(typeof pool.waiting).toBe('number')
      const a = await pool.acquire(); const b = await pool.acquire()
      expect(pool.size).toBe(2)
      expect(pool.idleCount).toBe(0)
      pool.release(a)
      expect(pool.idleCount).toBe(1)
      pool.release(b)
      expect(pool.idleCount).toBe(2)
      expect(pool.size).toBe(2)
    } finally {
      await pool.end()
    }
  })

  test('waiting reflects parked acquires and returns to 0 once slots free', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    try {
      const a = await pool.acquire()
      const w1 = pool.acquire(); const w2 = pool.acquire()
      await waitFor(() => pool.waiting === 2)
      expect(pool.waiting).toBe(2)
      expect(pool.idleCount).toBe(0)
      pool.release(a)
      const c1 = await w1
      pool.release(c1)
      const c2 = await w2
      pool.release(c2)
      expect(pool.waiting).toBe(0)
    } finally {
      await pool.end()
    }
  })
})

describe('multiple pools & config isolation', () => {
  test('two pools to different databases serve their own DB independently', async () => {
    const a = testPool({ database: 'testdb', applicationName: appName() })
    const b = testPool({ database: 'postgres', applicationName: appName() })
    try {
      const ra = await a.query('select current_database()')
      const rb = await b.query('select current_database()')
      expect((ra.rows[0] as unknown as unknown[])[0]).toBe('testdb')
      expect((rb.rows[0] as unknown as unknown[])[0]).toBe('postgres')
    } finally {
      await a.end(); await b.end()
    }
  })

  test('using a pool does not mutate the passed config object', async () => {
    const cfg = { ...({ host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb', max: 2, applicationName: appName() }) }
    const snapshot = JSON.stringify(cfg)
    const { createPool } = await import('../../src/index.ts')
    const pool = createPool(cfg)
    try {
      const c = await pool.acquire()
      pool.release(c)
      expect(JSON.stringify(cfg)).toBe(snapshot)
    } finally {
      await pool.end()
    }
  })

  test('endA() closes only pool A; pool B stays usable', async () => {
    const a = testPool({ max: 2, applicationName: appName() })
    const b = testPool({ max: 2, applicationName: appName() })
    try {
      await a.query('select 1')
      await b.query('select 1')
      await a.end()
      const e = await caught(() => a.query('select 1'))
      expect((e as Error).message).toMatch(/pool is closed/)
      const r = await b.query('select 99')
      expect((r.rows[0] as unknown as unknown[])[0]).toBe(99)
    } finally {
      await b.end()
    }
  })
})

describe('out-of-scope surface guards', () => {
  test('Pool has no sql`` template tag', () => {
    const pool = testPool({ applicationName: appName() })
    expect((pool as unknown as { sql?: unknown }).sql).toBeUndefined()
    void pool.end()
  })

  test('Pool exposes no COPY TO / cursor / native-libpq methods (copyFrom/copyMany ARE supported)', () => {
    const pool = testPool({ applicationName: appName() })
    const p = pool as unknown as Record<string, unknown>
    expect(typeof p.copyFrom).toBe('function')
    expect(typeof p.copyMany).toBe('function')
    expect(p.copyTo).toBeUndefined()
    expect(typeof p.cursor).toBe('function') // cursor() shipped 2026-07-10
    void pool.end()
  })

  test('reused conn + repeated named-statement queries do not error locally', async () => {
    const pool = testPool({ max: 1, applicationName: appName() })
    try {
      const { client, release } = await pool.connect() // pin to one backend
      const r1 = await client.query('select $1::int as v', [1], { name: 'ps_pool' })
      const r2 = await client.query('select $1::int as v', [2], { name: 'ps_pool' })
      expect((r1.rows[0] as unknown[])[0]).toBe(1)
      expect((r2.rows[0] as unknown[])[0]).toBe(2)
      release()
    } finally {
      await pool.end()
    }
  })
})

describe('roadmap (unimplemented)', () => {
  test.todo('connectionTimeoutMillis: parked acquire rejects with a timeout instead of hanging', () => {})
  test.todo('per-acquire AbortSignal cancels a parked waiter', () => {})
  test.todo('idleTimeoutMillis: idle conn closed after timeout, stats drop', () => {})
  test.todo('maxLifetimeSeconds: conn older than lifetime closed+replaced on release', () => {})
  test.todo('per-new-connection setup/onconnect hook runs once per new backend', () => {})
  test.todo('search_path leak guard: DISCARD ALL / reset-on-release between checkouts', () => {})
  test.todo('pool emits idle/release event when a client becomes available', () => {})
})
