// minipg/neon-ws — real Neon WebSocket-proxy transport test. Verifies the pieces our other transports
// can't: connecting a `wss://<host>/v2` WebSocket, the WebSocket->Duplex bridge, SCRAM-SHA-256 auth over
// the tunnel (no channel binding), and full protocol parity (prepared statements, pipelining, transactions).
//
// Needs a live Neon endpoint. Set NEON_WS_URL to a `postgresql://…neon.tech/db?sslmode=require` string:
//   NEON_WS_URL='postgresql://user:pass@ep-xxx.region.aws.neon.tech/db?sslmode=require' bun run test:neon-ws
// Skips entirely when unset, so it never breaks the default `bun test`.
//
// The CONNECT-FAILURE block at the bottom is offline (a fake WebSocket constructor) and always runs: the
// proxy is where things actually go wrong (429/401/ENOTFOUND/TLS, or a hang-up before the session opens)
// and that error used to be discarded and replaced with one constant string.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { connect, createPool } from '../../src/neon-ws.ts'
import type { Connection, Pool } from '../../src/neon-ws.ts'

const URL = process.env.NEON_WS_URL
const d = describe.skipIf(!URL)

d('minipg/neon-ws over the Neon WebSocket proxy', () => {
  let c: Connection
  beforeAll(async () => { c = await connect(URL!) })
  afterAll(async () => { await c?.end() })

  test('connects + authenticates (SCRAM over the tunnel) and reports server params', () => {
    expect(c.state).toBe('ready')
    expect(c.serverParams.server_version).toBeTruthy()
  })

  test('scalars, params, and core type decoders', async () => {
    const r = await c.query('select 1 as n, $1::text as t, (2 * 1.5)::float8 as f, true as b', ['hi'], { mode: 'object' })
    expect(r.rows[0]).toEqual({ n: 1, t: 'hi', f: 3, b: true })
    expect(r.columns).toEqual(['n', 't', 'f', 'b'])
    expect(r.command).toBe('SELECT')
    expect(r.rowCount).toBe(1)
  })

  test('precision-safe defaults: int8->BigInt, numeric->string, json->object, timestamptz->Date', async () => {
    const r = await c.query('select $1::int8 as big, $2::numeric as num, $3::json as j, now()::timestamptz as ts',
      ['9223372036854775807', '10.50', JSON.stringify({ a: 1 })], { mode: 'object' })
    const row = r.rows[0] as Record<string, unknown>
    expect(row.big).toBe(9223372036854775807n)
    expect(row.num).toBe('10.50')
    expect(row.j).toEqual({ a: 1 })
    expect(row.ts).toBeInstanceOf(Date)
  })

  test('large result streams through the WS bridge (chunk reassembly)', async () => {
    const r = await c.query('select g from generate_series(1, 1000) g')
    expect(r.rows.length).toBe(1000)
    expect(r.rows[0]).toEqual([1])
    expect(r.rows[999]).toEqual([1000])
  })

  test('server-side prepared statement reuse', async () => {
    const a = await c.query('select $1::int as x', [1], { name: 'nws_ps', mode: 'object', debug: true })
    const b = await c.query('select $1::int as x', [2], { name: 'nws_ps', mode: 'object', debug: true })
    expect(a.debug?.reusedPreparedStatement).toBe(false)
    expect(b.debug?.reusedPreparedStatement).toBe(true)
    expect((b.rows[0] as { x: number }).x).toBe(2)
  })

  test('pipelining engages on one connection (Promise.all -> maxInflight > 1)', async () => {
    const rs = await Promise.all([
      c.query('select 1 as a'), c.query('select 2 as a'), c.query('select 3 as a'),
      c.query('select pg_sleep(0)'), c.query('select 4 as a'),
    ])
    expect(rs.length).toBe(5)
    expect(c.stats.maxInflight).toBeGreaterThan(1)
  })

  test('async iteration (stream)', async () => {
    let seen = 0
    for await (const _row of c.stream('select g from generate_series(1, 250) g')) seen++
    expect(seen).toBe(250)
  })

  test('errors surface as PgError with SQLSTATE', async () => {
    let code: string | undefined
    try { await c.query('select * from a_table_that_does_not_exist') } catch (e) { code = (e as { code?: string }).code }
    expect(code).toBe('42P01')
  })

  test('transaction commit + rollback (connection-scoped temp table)', async () => {
    await c.begin(async (tx) => {
      await tx.query('create temp table nws_tx (id serial primary key, name text not null) on commit drop')
      await tx.query('insert into nws_tx (name) values ($1), ($2)', ['alice', 'bob'])
      const sel = await tx.query('select count(*)::int as n from nws_tx', [], { mode: 'object' })
      expect((sel.rows[0] as { n: number }).n).toBe(2)
    })
    // separate transaction so the ON COMMIT DROP temp table is gone; use a fresh temp table for rollback
    await expect(c.begin(async (tx) => {
      await tx.query('create temp table nws_rb (id int) on commit drop')
      await tx.query('insert into nws_rb values (1)')
      throw new Error('boom')
    })).rejects.toThrow('boom')
    // connection is usable after a rolled-back transaction
    const ok = await c.query('select 1 as ok', [], { mode: 'object' })
    expect((ok.rows[0] as { ok: number }).ok).toBe(1)
  })

  test('pool: query, parallel fan-out, and transaction', async () => {
    const pool: Pool = createPool(URL!)
    try {
      const r = await pool.query('select 42 as answer', [], { mode: 'object' })
      expect((r.rows[0] as unknown as { answer: number }).answer).toBe(42)

      const many = await Promise.all([1, 2, 3].map((i) => pool.query('select $1::int as i', [i], { mode: 'object' })))
      expect(many.map((m) => (m.rows[0] as unknown as { i: number }).i)).toEqual([1, 2, 3])

      const tx = await pool.begin(async (client) => (await client.query('select 7 as x', [], { mode: 'object' })).rows[0])
      expect((tx as { x: number }).x).toBe(7)
    } finally {
      await pool.end()
      expect(pool.size).toBe(0)
    }
  })
})

type Listener = (ev?: unknown) => void

// A WebSocket that never connects anywhere: the test drives its events directly.
class FakeWS {
  binaryType = ''
  readonly url: string
  private ls = new Map<string, Listener[]>()
  static last: FakeWS | undefined
  constructor(url: string) { this.url = url; FakeWS.last = this }
  addEventListener(type: string, cb: Listener): void { const a = this.ls.get(type) ?? []; a.push(cb); this.ls.set(type, a) }
  emit(type: string, ev?: unknown): void { for (const cb of this.ls.get(type) ?? []) cb(ev) }
  send(): void {}
  close(): void {}
}
const ctorThat = (drive: (ws: FakeWS) => void): new (url: string) => FakeWS =>
  class extends FakeWS { constructor(url: string) { super(url); queueMicrotask(() => drive(this)) } }

const tickWs = () => new Promise((r) => setTimeout(r, 20)) // let the queueMicrotask driver + connect() plumbing run

const cfg = (webSocketConstructor: new (url: string) => FakeWS) =>
  ({ host: 'ep-test.region.aws.neon.tech', database: 'db', user: 'u', password: 'p', connectTimeout: 3000, webSocketConstructor } as never)

describe('connect failures keep the WebSocket error (offline — a fake WebSocket, no NEON_WS_URL needed)', () => {
  test("the ErrorEvent's own text (e.g. 'Unexpected server response: 429') reaches the message and the cause", async () => {
    const cause = new Error('Unexpected server response: 429')
    const err = await connect(cfg(ctorThat((ws) => ws.emit('error', { error: cause, message: String(cause) })))).catch((e) => e) as Error
    expect(err.message).toContain('failed to open WebSocket')
    expect(err.message).toContain('429') // the actionable half, previously replaced by a constant string
    expect(err.message).toContain('ep-test.region.aws.neon.tech/v2') // still names the address it tried
    expect(err.cause).toBe(cause)
  }, 10000)

  test('an ErrorEvent carrying only a message string still surfaces it', async () => {
    const err = await connect(cfg(ctorThat((ws) => ws.emit('error', { message: 'getaddrinfo ENOTFOUND ep-test.region.aws.neon.tech' })))).catch((e) => e) as Error
    expect(err.message).toContain('ENOTFOUND')
  }, 10000)

  test('an event with nothing usable falls back to the plain message (no "undefined" in it)', async () => {
    const err = await connect(cfg(ctorThat((ws) => ws.emit('error', {})))).catch((e) => e) as Error
    expect(err.message).toContain('failed to open WebSocket')
    expect(err.message).not.toContain('undefined')
  }, 10000)

  test('a close BEFORE open settles the connect promise instead of hanging until connectTimeout', async () => {
    const started = Date.now()
    const err = await connect(cfg(ctorThat((ws) => ws.emit('close', { code: 1006, reason: 'abnormal closure' })))).catch((e) => e) as Error
    expect(err.message).toContain('closed before opening')
    expect(err.message).toContain('1006')
    expect(err.message).toContain('abnormal closure')
    expect(Date.now() - started).toBeLessThan(2000) // NOT the 3s connectTimeout this config allows
  }, 10000)

  test('an error already rejected is not re-reported by the close that follows it', async () => {
    const err = await connect(cfg(ctorThat((ws) => {
      ws.emit('error', { error: new Error('Unexpected server response: 401') })
      ws.emit('close', { code: 1006 })
    }))).catch((e) => e) as Error
    expect(err.message).toContain('401') // the error wins; the close does not overwrite it
  }, 10000)
})

// Neon prints `?sslmode=require&channel_binding=require` on EVERY connection string it issues, and that
// URL used to make this entry unusable: `ssl: false` + `socket` (both mandatory here — the wss tunnel is
// the TLS, and it IS the transport) tripped the Connection constructor's channel_binding guard, so
// connect() threw before dialing anything and pool.query() spent the full acquire timeout reporting a
// database that was "not recovering". No caller could satisfy the parameter on this transport, so it is
// relaxed to 'prefer' instead of being fatal.
// This entry RELAXES `require` to 'prefer' — it is deliberately different from minipg/cf and minipg/deno,
// which refuse it. The reason is that this one points at a single provider: Neon prints
// `?sslmode=require&channel_binding=require` on every connection string it issues, and its own drivers
// ignore the parameter — @neondatabase/serverless always selects plain SCRAM-SHA-256 and hardcodes the
// gs2 header `n,,` (`c=biws`), and never even parses `channel_binding` out of the URL. Refusing would
// reject Neon's own default connection string; relaxed, minipg puts the identical bytes on the wire.
describe('channel_binding=require in a provider URL is relaxed, not fatal (offline)', () => {
  const NEON_URL = 'postgresql://u:p@ep-test.region.aws.neon.tech/verceldb?sslmode=require&channel_binding=require'
  const opening = () => ctorThat(() => {}) // never opens: the test only cares that a socket was BUILT
  const built = (): FakeWS | undefined => FakeWS.last // read through a call: a direct `FakeWS.last = undefined` narrows the static to `undefined`

  test('connect() reaches the WebSocket transport instead of throwing at construction', async () => {
    FakeWS.last = undefined
    const p = connect({ url: NEON_URL, connectTimeout: 300, webSocketConstructor: opening() } as never).catch((e) => e as Error)
    await tickWs()
    expect(built()?.url).toBe('wss://ep-test.region.aws.neon.tech/v2') // a socket was opened => no guard
    expect(((await p) as Error).message).not.toContain('channel_binding') // it fails on the timeout, not the config
  }, 10000)

  test('pool.query() reports the real TRANSPORT failure, not a config guard', async () => {
    // Pre-fix the constructor threw before any socket existed, so the breaker's tripping error — the one
    // named in the timeout message and in pool.lastError — was the channel_binding guard, and the probe
    // re-ran that same constructor forever. Now the pool is looking at the WebSocket's own failure, which
    // is genuinely transient and correctly stays recoverable.
    const pool = createPool({ url: NEON_URL, max: 1, connectTimeout: 300,
      reconnect: { baseMs: 20, acquireTimeoutMs: 300 }, webSocketConstructor: ctorThat((ws) => ws.emit('close', { code: 1006, reason: 'gone' })) } as never)
    const err = await pool.query('select 1', []).catch((e) => e) as Error
    expect(err.message).not.toContain('channel_binding')
    expect(pool.lastError?.message).toContain('closed before opening')
    expect(pool.lastError?.message).toContain('1006')
    await pool.end()
  }, 10000)

  test('an explicit channelBinding still wins over the URL (only `require` is downgraded)', async () => {
    FakeWS.last = undefined
    // 'disable' is a legitimate stance on this transport and must survive untouched — proven by the
    // socket still being built (a fatal guard would have stopped us) with no error about the parameter.
    const p = connect({ url: NEON_URL, channelBinding: 'disable', connectTimeout: 300, webSocketConstructor: opening() } as never).catch((e) => e as Error)
    await tickWs()
    expect(built()).toBeDefined()
    expect(((await p) as Error).message).not.toContain('channel_binding')
  }, 10000)

  test('it is RELAXED, not refused — minipg/cf and minipg/deno take the opposite path', async () => {
    const err = await connect({ url: NEON_URL, connectTimeout: 300, webSocketConstructor: opening() } as never).catch((e: Error) => e) as Error
    expect(err.message).not.toMatch(/cannot be honoured/) // the cf/deno refusal message must NOT appear here
  }, 10000)
})
