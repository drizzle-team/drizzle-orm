// Graceful-reconnect behavior, driven against the in-process MockPgServer — no real PG.
// Covers: single-flight reconnect (no herd), dead-idle eviction, fatal vs recoverable,
// acquire timeout, in-flight reject (no replay), and end() during an outage — plus what the
// circuit breaker REPORTS when it trips, and whether it can re-evaluate inside an acquire window.
import { test, expect, describe } from 'bun:test'
import net from 'node:net'
import { connect, createPool, PgError } from '../../src/index.ts'
import { MockPgServer } from '../mock/server.ts'

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))
const OK = () => ({ fields: [{ name: 'n', oid: 23 }], rows: [['1']] as string[][], command: 'SELECT' })
async function withMock<T>(fn: (m: MockPgServer) => Promise<T>): Promise<T> {
  const m = await MockPgServer.start({ onQuery: OK })
  try { return await fn(m) } finally { await m.close() }
}

describe('pool: single-flight reconnect', () => {
  test('after a restart, ONE probe reconnects and the whole herd is released', async () => {
    await withMock(async (m) => {
      const pool = createPool(m.connectConfig({ reconnect: { baseMs: 60, maxMs: 120, acquireTimeoutMs: 5000 } }))
      expect((await pool.query('select 1')).rows.length).toBe(1) // warm up one connection

      m.killActive(); m.setAvailable(false) // database restarts
      await tick(30)

      const first = pool.execute('select 1') // eager: this acquire trips the breaker (lazy query() wouldn't run yet)
      await tick(50)
      expect(pool.isDown).toBe(true)

      const before = m.connectAttempts
      const burst = Promise.all(Array.from({ length: 8 }, () => pool.query('select 1'))) // all wait on the probe
      await tick(250) // several backoff rounds elapse while down
      const attemptsWhileDown = m.connectAttempts - before
      expect(attemptsWhileDown).toBeLessThan(6) // single-flight: only the probe tried, NOT 9 waiters x rounds

      m.setAvailable(true) // database is back
      const results = await Promise.all([first, ...(await burst.then((r) => r))])
      expect(results.every((r) => r.rows.length === 1)).toBe(true) // everyone recovered
      expect(pool.isDown).toBe(false)
      await pool.end()
    })
  }, 15000)

  test('a connection that died while idle is evicted on the next acquire', async () => {
    await withMock(async (m) => {
      const pool = createPool(m.connectConfig())
      await pool.query('select 1')
      expect(pool.idleCount).toBe(1)
      m.killActive() // kill the idle connection (server still up)
      await tick(40)
      const r = await pool.query('select 1') // must drop the dead one and open a fresh one
      expect(r.rows.length).toBe(1)
      await pool.end()
    })
  })
})

describe('pool: recoverable vs fatal', () => {
  test('a prolonged outage makes acquire time out (no hang)', async () => {
    await withMock(async (m) => {
      const pool = createPool(m.connectConfig({ reconnect: { baseMs: 40, acquireTimeoutMs: 150 } }))
      m.setAvailable(false)
      const err = await pool.query('select 1').catch((e) => e)
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toMatch(/timed out/)
      await pool.end()
    })
  }, 10000)

  test('an unrecoverable startup error (auth) breaks the pool — no endless probing', async () => {
    await withMock(async (m) => {
      m.failStartupWith('28P01')
      const pool = createPool(m.connectConfig({ reconnect: { baseMs: 30 } }))
      const err = await pool.query('select 1').catch((e) => e)
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('28P01')
      const before = m.connectAttempts
      await tick(150)
      expect(m.connectAttempts - before).toBe(0) // does not probe a fatal error
      const err2 = await pool.query('select 1').catch((e) => e)
      expect((err2 as PgError).code).toBe('28P01') // fast-fails as broken
      await pool.end()
    })
  })
})

describe('pool: safety', () => {
  test('a mid-query connection loss rejects and is never silently replayed', async () => {
    await withMock(async (m) => {
      const pool = createPool(m.connectConfig())
      m.setMode('fatal-then-close')
      const err = await pool.query('select 1').catch((e) => e)
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('57P01') // surfaced to the caller, not hidden+retried
      m.setMode('normal')
      const ok = await pool.query('select 1') // a NEW query works once the server is healthy
      expect(ok.rows.length).toBe(1)
      await pool.end()
    })
  })

  test('end() during an outage rejects waiting acquirers (no hang)', async () => {
    await withMock(async (m) => {
      const pool = createPool(m.connectConfig({ reconnect: { baseMs: 50, acquireTimeoutMs: 5000 } }))
      m.setAvailable(false)
      const waiting = pool.query('select 1').catch((e) => e) // trips down, then waits
      await tick(70)
      await pool.end()
      expect(await waiting).toBeInstanceOf(Error)
    })
  }, 10000)
})

describe('single connection: durable reconnect (opt-in)', () => {
  test('reconnects after a drop and runs queries enqueued while down', async () => {
    await withMock(async (m) => {
      const c = await connect(m.connectConfig({ reconnect: { baseMs: 40, maxMs: 80 } }))
      expect((await c.query('select 1')).rows.length).toBe(1)
      m.killActive() // drop; server still up -> auto-reconnect
      await tick(20)
      expect(c.state).toBe('reconnecting')
      const q = c.query('select 1') // enqueued during reconnect -> runs after recovery
      expect((await q).rows.length).toBe(1)
      expect(c.state).toBe('ready')
      await c.end()
    })
  }, 10000)

  test('in-flight query rejects on drop (never replayed); connection then recovers', async () => {
    await withMock(async (m) => {
      const c = await connect(m.connectConfig({ reconnect: { baseMs: 40 } }))
      m.setMode('fatal-then-close')
      const err = await c.query('select 1').catch((e) => e)
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('57P01')
      m.setMode('normal')
      await tick(90) // auto-reconnect
      expect((await c.query('select 1')).rows.length).toBe(1)
      expect(c.state).toBe('ready')
      await c.end()
    })
  }, 10000)

  test('prepared-statement cache is cleared on reconnect (no 26000 on reuse)', async () => {
    await withMock(async (m) => {
      const c = await connect(m.connectConfig({ reconnect: { baseMs: 40 } }))
      await c.query('select $1::int', [1], { name: 'p1' }) // Parse + cache server-side
      m.killActive() // restart loses the server-side statement
      await tick(90) // reconnect clears the client cache
      const r = await c.query('select $1::int', [2], { name: 'p1' }) // re-Parses -> must NOT be 26000
      expect(r.rows.length).toBe(1)
      expect(c.state).toBe('ready')
      await c.end()
    })
  }, 10000)

  test('end() during a failing reconnect settles pending and stops retrying', async () => {
    await withMock(async (m) => {
      const c = await connect(m.connectConfig({ reconnect: { baseMs: 40 } }))
      m.killActive(); m.setAvailable(false) // drop, server stays down
      await tick(20)
      const pending = c.query('select 1').catch((e) => e)
      await tick(30)
      await c.end()
      expect(await pending).toBeInstanceOf(Error)
      expect(c.state).toBe('closed')
    })
  }, 10000)

  test('an auth failure during reconnect gives up (no endless retry)', async () => {
    await withMock(async (m) => {
      const c = await connect(m.connectConfig({ reconnect: { baseMs: 30 } }))
      m.setMode('hang')
      const pending = c.query('select 1').catch((e) => e) // hangs -> reliably in-flight
      await tick(20)
      m.failStartupWith('28P01'); m.killActive() // drop; every reconnect now hits 28P01
      expect(await pending).toBeInstanceOf(Error) // in-flight rejected (no replay)
      await tick(90)
      expect(c.state).toBe('closed') // gave up on the fatal auth error
      const a = m.connectAttempts
      await tick(90)
      expect(m.connectAttempts).toBe(a) // and stopped retrying
      await c.end()
    })
  }, 10000)
})

describe('pool breaker: the tripping error survives', () => {
  test('a recovery timeout carries the outage as `cause` and names it in the message', async () => {
    const m = await MockPgServer.start({ onQuery: OK })
    try {
      const pool = createPool(m.connectConfig({ connectTimeout: 200, reconnect: { baseMs: 30, acquireTimeoutMs: 250 } }))
      m.setAvailable(false) // connections are refused from here on
      const err = await pool.query('select 1').catch((e) => e) as Error
      expect(err.message).toMatch(/timed out/)
      expect(err.message).toMatch(/last error:/) // the cause is IN the message, not only attached
      expect(err.cause).toBeInstanceOf(Error) // …and attached, for programmatic handling
      expect(pool.lastError).toBeInstanceOf(Error) // and readable off the pool while it is down
      await pool.end()
    } finally { await m.close() }
  }, 10000)

  test("the timeout Error's stack names the acquire path, not Timeout._onTimeout", async () => {
    const m = await MockPgServer.start({ onQuery: OK })
    try {
      const pool = createPool(m.connectConfig({ connectTimeout: 200, reconnect: { baseMs: 30, acquireTimeoutMs: 250 } }))
      m.setAvailable(false)
      const err = await pool.query('select 1').catch((e) => e) as Error
      // Built when waitForRecovery() is ENTERED. Constructed inside the setTimeout callback instead,
      // the whole stack is `at Timeout._onTimeout` — no frame from the driver or the caller at all.
      expect(err.stack).toContain('waitForRecovery')
      expect(err.stack).toContain('acquire')
      expect(err.stack).not.toContain('Timeout._onTimeout')
      await pool.end()
    } finally { await m.close() }
  }, 10000)
})

describe('pool breaker: a STALLED probe attempt does not outlive the waiters', () => {
  // A server that refuses the first connection, then accepts and NEVER answers the startup message —
  // exactly how a proxy behaves when it takes the socket and stalls the session. The first refusal
  // trips the breaker; every probe attempt afterwards hangs until something bounds it.
  test('the probe keeps iterating (bounded per attempt) instead of hanging for connectTimeout', async () => {
    const sockets: net.Socket[] = []
    let accepted = 0
    const server = net.createServer((s) => {
      sockets.push(s)
      s.on('error', () => {})
      if (accepted++ === 0) { s.destroy(); return } // first attempt fails fast -> trips the breaker
      // subsequent attempts: hold the socket open, answer nothing
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as net.AddressInfo).port
    try {
      const pool = createPool({
        host: '127.0.0.1', port, user: 'u', database: 'd', password: '', ssl: false,
        connectTimeout: 30000, // the real-world default: MUST NOT bound the probe loop
        reconnect: { baseMs: 20, maxMs: 40, acquireTimeoutMs: 900 },
      })
      const err = await pool.query('select 1').catch((e) => e) as Error
      expect(err.message).toMatch(/timed out/)
      expect(accepted).toBeGreaterThanOrEqual(3) // 1 refusal + ≥2 evaluated probe attempts in a 900ms window
      await pool.end()
    } finally {
      for (const s of sockets) s.destroy()
      await new Promise<void>((r) => server.close(() => r()))
    }
  }, 15000)

  test('probeConnectTimeoutMs is capped by connectTimeout (never longer than the caller allows)', async () => {
    const m = await MockPgServer.start({ onQuery: OK })
    try {
      const pool = createPool(m.connectConfig({ connectTimeout: 50, reconnect: { baseMs: 20, acquireTimeoutMs: 200, probeConnectTimeoutMs: 10000 } }))
      m.setAvailable(false)
      await pool.query('select 1').catch(() => {})
      m.setAvailable(true)
      await tick(120)
      expect((await pool.query('select 1')).rows.length).toBe(1) // recovers; the probe was never stuck on 10s
      await pool.end()
    } finally { await m.close() }
  }, 10000)
})

describe('pool breaker: classify()', () => {
  test('08004 (server rejected the connection) fails fast instead of probing silently', async () => {
    const m = await MockPgServer.start({ onQuery: OK })
    try {
      m.failStartupWith('08004', 'no pg_hba.conf entry for host')
      const pool = createPool(m.connectConfig({ reconnect: { baseMs: 20 } }))
      const err = await pool.query('select 1').catch((e) => e)
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('08004')
      const before = m.connectAttempts
      await tick(120)
      expect(m.connectAttempts - before).toBe(0) // no probe loop behind a generic timeout
      await pool.end()
    } finally { await m.close() }
  }, 10000)

  test("a provider's disabled-endpoint refusal surfaces its own message", async () => {
    const m = await MockPgServer.start({ onQuery: OK })
    try {
      m.failStartupWith('XX000', 'The endpoint has been disabled. Enable it using Neon API and retry.')
      const pool = createPool(m.connectConfig({ reconnect: { baseMs: 20, acquireTimeoutMs: 5000 } }))
      const err = await pool.query('select 1').catch((e) => e)
      expect((err as Error).message).toMatch(/endpoint has been disabled/) // not "timed out … waiting to recover"
      await pool.end()
    } finally { await m.close() }
  }, 10000)

  test('a plain outage is still TRANSIENT — the pool recovers on its own (53300/57P03 class)', async () => {
    const m = await MockPgServer.start({ onQuery: OK })
    try {
      const pool = createPool(m.connectConfig({ connectTimeout: 200, reconnect: { baseMs: 30, acquireTimeoutMs: 4000 } }))
      m.setAvailable(false)
      const waiting = pool.execute('select 1') // eager: this acquire trips the breaker (query() is lazy)
      await tick(80)
      expect(pool.isDown).toBe(true)
      m.setAvailable(true)
      expect((await waiting).rows.length).toBe(1) // never latched permanently broken
      expect(pool.isDown).toBe(false)
      await pool.end()
    } finally { await m.close() }
  }, 10000)
})

// A misconfiguration is not an outage. The Connection CONSTRUCTOR validates config before any I/O, so
// whatever it throws throws identically on every retry — but it carries no SQLSTATE, so classify() used
// to call it 'unavailable': the breaker tripped, every acquire burned the full acquireTimeout, and the
// probe re-ran the same failing constructor forever. The pool then reported a database that was "not
// recovering" while the real cause was one config field.
describe('pool breaker: a CONFIG error fails fast instead of masquerading as an outage', () => {
  const neverDialed = () => { throw new Error('transport must not be reached — the config is already invalid') }
  // channel_binding=require over plain TCP: the binding hashes a TLS certificate, and there is no TLS.
  // (require + a CUSTOM socket is deliberately NOT decided here — that transport owns its TLS and may well
  // expose the certificate, so scramForChannel settles it at auth time; see test/integration/tls-ssl.)
  const badCb = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', database: 'db', ssl: false as const,
    channelBinding: 'require' as const, reconnect: { baseMs: 20, acquireTimeoutMs: 5000 } }

  test('rejects in milliseconds with the config error, not "waiting for the database to recover"', async () => {
    const pool = createPool(badCb)
    const t0 = Date.now()
    const err = await pool.query('select 1').catch((e) => e) as Error
    expect(Date.now() - t0).toBeLessThan(1000) // was the full 30s acquireTimeout
    expect(err.message).toMatch(/channel_binding=require needs TLS/)
    expect(err.message).not.toMatch(/waiting for the database to recover/)
    await pool.end()
  })

  test('latches BROKEN — no probe loop re-running a constructor that cannot succeed', async () => {
    const pool = createPool(badCb)
    await pool.query('select 1').catch(() => {})
    await tick(150) // several backoff rounds would have elapsed
    expect(pool.isDown).toBe(false) // never entered recovery
    const again = await pool.query('select 1').catch((e) => e) as Error
    expect(again.message).toMatch(/channel_binding=require/) // same real message, still immediate
    expect(pool.lastError?.message).toMatch(/channel_binding=require/)
    await pool.end()
  })

  test('every constructor-validated field behaves the same way (a NUL in `options`)', async () => {
    const pool = createPool({ host: '127.0.0.1', port: 1, socket: neverDialed, options: '-c search_path=a\0b',
      reconnect: { baseMs: 20, acquireTimeoutMs: 5000 } })
    const t0 = Date.now()
    const err = await pool.query('select 1').catch((e) => e) as Error
    expect(err.message).toMatch(/startup parameter options contains NUL/)
    expect(Date.now() - t0).toBeLessThan(1000)
    await pool.end()
  })
})

// The probe's backoff was a bare setTimeout, so a pool ended mid-round left it armed: Node/Bun delay
// process exit until it fires (up to reconnect.maxMs), and Deno's leak sanitizer fails the test outright
// — which is how this surfaced, in test/deno/deno.test.ts.
describe('pool breaker: the probe backoff timer does not outlive end()', () => {
  test('end() during a backoff round clears the pending timer', async () => {
    const BACKOFF = 400
    const live = new Map<unknown, number>()
    const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout
    globalThis.setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
      const id = realSet(() => { live.delete(id); fn() }, ms, ...(rest as []))
      live.set(id, ms ?? 0)
      return id
    }) as typeof setTimeout
    globalThis.clearTimeout = ((id?: unknown) => { live.delete(id); realClear(id as Parameters<typeof realClear>[0]) }) as typeof clearTimeout
    try {
      // an unreachable port: the first acquire trips the breaker, then the probe naps for BACKOFF
      const pool = createPool({ host: '127.0.0.1', port: 1, user: 'u', database: 'db',
        connectTimeout: 200, reconnect: { baseMs: BACKOFF, maxMs: BACKOFF, acquireTimeoutMs: 100 } })
      await pool.execute('select 1').catch(() => {}) // eager: query() is lazy and would never trip it
      await tick(60) // now inside the backoff nap
      const naps = () => [...live.values()].filter((ms) => ms >= BACKOFF / 2) // the jittered nap: [maxMs/2, maxMs]
      expect(naps().length).toBe(1) // the nap is armed…
      await pool.end()
      expect(naps()).toEqual([]) // …and end() disarmed it
    } finally {
      globalThis.setTimeout = realSet
      globalThis.clearTimeout = realClear
      for (const id of live.keys()) realClear(id as Parameters<typeof realClear>[0])
    }
  }, 10000)

  test('recovery clears it too, and the loop stops probing', async () => {
    await withMock(async (m) => {
      const pool = createPool(m.connectConfig({ connectTimeout: 200, reconnect: { baseMs: 40, maxMs: 60, acquireTimeoutMs: 4000 } }))
      m.setAvailable(false)
      const waiting = pool.execute('select 1')
      await tick(80)
      expect(pool.isDown).toBe(true)
      m.setAvailable(true)
      expect((await waiting).rows.length).toBe(1)
      const after = m.connectAttempts
      await tick(200) // several backoff rounds' worth: a live nap would have kept probing
      expect(m.connectAttempts).toBe(after)
      await pool.end()
    })
  }, 10000)
})
