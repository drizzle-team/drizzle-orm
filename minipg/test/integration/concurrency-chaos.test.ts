// Domain: "concurrency-chaos".
// Exercises minipg's one-query-in-flight serialization, strict FIFO ordering,
// interleaved query+stream, pool contention/parallelism, and the settlement
// invariant ("every terminal event settles a promise, no hang") under chaos:
// a backend killed mid-flight, a socket destroyed by a mock server, end() races.
//
// ISOLATION: all writes go to CONNECTION-SCOPED `create temp table` objects or to
// a private mock server. `public.t` is never mutated. Chaos only ever kills *our
// own* backend (via pg_terminate_backend on our captured backendKey.pid).
import { test, expect, describe } from 'bun:test'
import net from 'node:net'
import { connect } from '../../src/index.ts'
import { testConnect, testPool, caught, PgError } from '../helpers/db.ts'

// ---------- small helpers ----------
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const cell0 = (r: { rows: unknown[] }) => (r.rows[0] as unknown[])[0]
const pcell0 = (r: { rows: unknown[] }) => (r.rows[0] as unknown as unknown[])[0] // pool results are typed `never`

// ============================================================================
describe('single-connection serialization & strict FIFO', () => {
  test('two un-awaited queries both resolve with their own values, in order', async () => {
    const c = await testConnect()
    try {
      const order: number[] = []
      const p1 = c.query('select 1 as a').then((r) => { order.push(cell0(r) as number) })
      const p2 = c.query('select 2 as b').then((r) => { order.push(cell0(r) as number) })
      await Promise.all([p1, p2])
      expect(order).toEqual([1, 2]) // FIFO: first submitted settles first
    } finally { await c.end() }
  })

  test('loop of un-awaited select $1 — each result reflects its own i, completion order == submission order', async () => {
    const c = await testConnect()
    try {
      const done: number[] = []
      const ps: Promise<void>[] = []
      for (let i = 0; i < 10; i++) {
        ps.push(c.query('select $1::int as v', [i]).then((r) => { done.push(cell0(r) as number) }))
      }
      await Promise.all(ps)
      expect(done).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    } finally { await c.end() }
  })

  test('N=100 un-awaited INSERTs persist and read back in order (temp table)', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table cc_ins(id int)')
      const ps: Promise<unknown>[] = []
      for (let i = 0; i < 100; i++) ps.push(c.query('insert into cc_ins values ($1)', [i]))
      await Promise.all(ps)
      const cnt = await c.query('select count(*)::int from cc_ins')
      expect(cell0(cnt)).toBe(100)
      const ordered = await c.query('select id from cc_ins order by id')
      expect(ordered.rows.map((row) => (row as unknown[])[0])).toEqual([...Array(100).keys()])
    } finally { await c.end() }
  })

  test('read-after-write: a queued SELECT observes the preceding INSERT ... RETURNING', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table cc_raw(id int, name text)')
      const ins = c.query('insert into cc_raw values ($1,$2) returning id,name', [7, 'seven'], { mode: 'object' })
      const sel = c.query('select name from cc_raw where id = 7', [], { mode: 'object' })
      const [ri, rs] = await Promise.all([ins, sel])
      expect((ri.rows[0] as Record<string, unknown>).name).toBe('seven')
      expect((rs.rows[0] as Record<string, unknown>).name).toBe('seven') // not a stale read
    } finally { await c.end() }
  })

  test('FIFO survives an error mid-queue: BEGIN, failing-stmt, ROLLBACK, select 1', async () => {
    const c = await testConnect()
    try {
      const begin = c.query('begin')
      const bad = caught(() => c.query('select * from cc_no_such_table_xyz'))
      const rollback = c.query('rollback')
      const final = c.query('select 1 as v')
      await begin
      expect(await bad).toBeInstanceOf(PgError)
      await rollback // runs AFTER the failure, clears the aborted tx
      const r = await final
      expect(cell0(r)).toBe(1)
      expect(c.inTransaction).toBe(false)
    } finally { await c.end() }
  })

  test('CONTRACT: a concurrent second query is QUEUED (not rejected) — both settle', async () => {
    const c = await testConnect()
    try {
      const a = c.query('select pg_sleep(0.1), 1 as v')
      const b = c.query('select 2 as v') // issued while a is in-flight: queued, not fast-failed
      const [ra, rb] = await Promise.all([a, b])
      expect(cell0(ra)).toBe('') // pg_sleep returns void/empty-text in col0
      expect(cell0(rb)).toBe(2)
    } finally { await c.end() }
  })
})

// ============================================================================
describe('strict result-set integrity under load', () => {
  test('soak: 500 small select $1 on one connection stay complete & correct', async () => {
    const c = await testConnect()
    try {
      const ps: PromiseLike<{ rows: unknown[] }>[] = [] // pool.query() is lazy; Promise.all below runs them
      for (let i = 0; i < 500; i++) ps.push(c.query('select $1::int as v', [i]))
      const rs = await Promise.all(ps)
      for (let i = 0; i < 500; i++) {
        expect(rs[i]!.rows.length).toBe(1)
        expect(cell0(rs[i]!)).toBe(i)
      }
    } finally { await c.end() }
  }, 30000)

  test('heavy mixed-width concurrent queries: NULLs, large text, bytea, int8/numeric-as-string', async () => {
    const c = await testConnect()
    try {
      const big = 'x'.repeat(20000)
      const pText = c.query('select null::text as a, $1::text as b', [big])
      const pWidths = c.query('select 1::int2 as a, 2::int4 as b, 3::int8 as c')
      const pInt8 = c.query('select 9223372036854775807::int8 as a')
      const pNum = c.query('select 123.456::numeric as a')
      const pBytea = c.query('select $1::bytea as a', [Buffer.from([0xde, 0xad, 0xbe, 0xef])]) // array mode -> bytea decoder yields Buffer
      const [rt, rw, ri, rn, rb] = await Promise.all([pText, pWidths, pInt8, pNum, pBytea])

      expect((rt.rows[0] as unknown[])[0]).toBeNull()
      expect((rt.rows[0] as unknown[])[1]).toBe(big)
      expect((rw.rows[0] as unknown[])[0]).toBe(1) // int2 -> number
      expect((rw.rows[0] as unknown[])[2]).toBe(3n) // int8 -> BigInt
      expect((ri.rows[0] as unknown[])[0]).toBe(9223372036854775807n)
      expect((rn.rows[0] as unknown[])[0]).toBe('123.456')
      const cellb = (rb.rows[0] as unknown[])[0]
      expect(Buffer.isBuffer(cellb)).toBe(true)
      expect((cellb as Buffer).toString('hex')).toBe('deadbeef')
    } finally { await c.end() }
  })

  test('mixed result modes in one burst do not cross-talk', async () => {
    const c = await testConnect()
    try {
      const pArr = c.query('select 1 as a')
      const pObj = c.query('select 2 as b', [], { mode: 'object' })
      const pBuf = c.query('select 3 as c', [], { mode: 'buffer' })
      const pRaw = c.query('select 4 as d', [], { mode: 'raw' })
      const [ra, ro, rb, rr] = await Promise.all([pArr, pObj, pBuf, pRaw])
      expect((ra.rows[0] as unknown[])[0]).toBe(1)
      expect((ro.rows[0] as Record<string, unknown>).b).toBe(2)
      expect(Buffer.isBuffer((rb.rows[0] as (Buffer | null)[])[0])).toBe(true)
      expect(Buffer.isBuffer(rr.rows[0] as Buffer)).toBe(true)
    } finally { await c.end() }
  })
})

// ============================================================================
describe('interleaved query + stream on one connection', () => {
  test('a query issued while a stream is in-flight is queued behind it', async () => {
    const c = await testConnect()
    try {
      const it = c.stream<unknown[]>('select g from generate_series(1,500) g')
      const qp = c.query('select 42 as v') // queued behind the stream task
      let count = 0
      let last = 0
      for await (const row of it) { count++; last = (row as unknown[])[0] as number }
      expect(count).toBe(500)
      expect(last).toBe(500)
      const r = await qp
      expect(cell0(r)).toBe(42)
    } finally { await c.end() }
  })

  test('early break mid-stream leaves the connection usable (no CancelRequest, drains server-side)', async () => {
    const c = await testConnect()
    try {
      const it = c.stream<unknown[]>('select g from generate_series(1,5000) g')
      let n = 0
      for await (const row of it) { void row; n++; if (n >= 3) break }
      expect(n).toBe(3)
      const r = await c.query('select 7 as v') // next query on same conn still works
      expect(cell0(r)).toBe(7)
    } finally { await c.end() }
  })

  test('two streams back-to-back serialize; rows go to the right iterator', async () => {
    const c = await testConnect()
    try {
      const it1 = c.stream<unknown[]>('select g from generate_series(1,100) g')
      const it2 = c.stream<unknown[]>('select g from generate_series(101,200) g')
      const a: number[] = []
      for await (const row of it1) a.push((row as unknown[])[0] as number)
      const b: number[] = []
      for await (const row of it2) b.push((row as unknown[])[0] as number)
      expect(a.length).toBe(100)
      expect(a[0]).toBe(1)
      expect(b.length).toBe(100)
      expect(b[0]).toBe(101)
    } finally { await c.end() }
  })

  test('stream() on an already-closed connection yields a rejecting next() (no hang)', async () => {
    const c = await testConnect()
    await c.end()
    const it = c.stream<unknown[]>('select 1')
    const err = await caught(() => it.next())
    expect((err as Error).message).toMatch(/connection is closed/)
  })
})

// ============================================================================
describe('pool parallelism, contention & fairness', () => {
  test('max>=4: four pg_sleep(0.3) overlap on separate backends (~0.3s, not ~1.2s)', async () => {
    const pool = testPool({ max: 4 })
    try {
      const start = Date.now()
      await Promise.all([0, 1, 2, 3].map(() => pool.query('select pg_sleep(0.3)')))
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(1000) // overlapping, not serialized at 1.2s
    } finally { await pool.end() }
  }, 15000)

  test('20 concurrent pool.query on a max=4 pool all succeed with correct values', async () => {
    const pool = testPool({ max: 4 })
    try {
      const ps: PromiseLike<{ rows: unknown[] }>[] = [] // pool.query() is lazy; Promise.all below runs them
      for (let i = 0; i < 20; i++) ps.push(pool.query('select $1::int as v', [i]))
      const rs = await Promise.all(ps)
      for (let i = 0; i < 20; i++) expect(pcell0(rs[i]!)).toBe(i)
      expect(pool.size).toBeLessThanOrEqual(4)
    } finally { await pool.end() }
  }, 15000)

  test('max=3: 5 concurrent queries, excess park in waiters, all 5 resolve', async () => {
    const pool = testPool({ max: 3 })
    try {
      const ps: PromiseLike<{ rows: unknown[] }>[] = [] // pool.query() is lazy; Promise.all below runs them
      for (let i = 0; i < 5; i++) ps.push(pool.query('select $1::int as v', [i]))
      const rs = await Promise.all(ps)
      const values = rs.map((r) => pcell0(r)).sort((x, y) => (x as number) - (y as number))
      expect(values).toEqual([0, 1, 2, 3, 4])
      expect(pool.size).toBeLessThanOrEqual(3)
    } finally { await pool.end() }
  })

  test('pool.connect() for a transaction, then release reuses the same connection (max=1)', async () => {
    const pool = testPool({ max: 1 })
    try {
      const { client, release } = await pool.connect()
      await client.query('begin')
      await client.query('create temp table cc_pool_tx(i int)')
      await client.query('insert into cc_pool_tx values (1)')
      await client.query('commit')
      release()
      const second = await pool.connect()
      expect(second.client).toBe(client) // same physical conn reused
      second.release()
    } finally { await pool.end() }
  })

  test('FOOTGUN: idle reuse is LIFO (last released is reused first), not round-robin', async () => {
    const pool = testPool({ max: 2 })
    try {
      const a = await pool.acquire()
      const b = await pool.acquire()
      pool.release(a)
      pool.release(b) // b ends up on top of the LIFO stack
      const next = await pool.acquire()
      expect(next).toBe(b) // documents LIFO: do not assume FIFO connection rotation
      pool.release(next)
    } finally { await pool.end() }
  })
})

// ============================================================================
describe('CHAOS: backend killed mid-flight (settlement invariant, real cluster)', () => {
  test('THE INVARIANT: in-flight + queued all reject when our backend is killed; state=closed', async () => {
    const victim = await testConnect()
    const killer = await testConnect()
    try {
      const inflight = victim.query('select pg_sleep(10)') // slow, occupies the backend
      const q1 = victim.query('select 1') // queued behind it
      const q2 = victim.query('select 2') // queued behind it
      await delay(150) // let pg_sleep actually start server-side
      const pid = victim.backendKey!.pid
      await killer.query('select pg_terminate_backend($1)', [pid]) // kill ONLY our own backend
      const settled = await Promise.allSettled([inflight, q1, q2])
      expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected', 'rejected'])
      // give the socket 'close' a tick to flip state if not already
      await delay(50)
      expect(victim.state).toBe('closed')
    } finally {
      await victim.end()
      await killer.end()
    }
  }, 15000)

  test('query() on an already-closed connection rejects immediately with "connection is closed"', async () => {
    const c = await testConnect()
    await c.end()
    const err = await caught(() => c.query('select 1'))
    expect((err as Error).message).toMatch(/connection is closed/)
  })

  test('pool self-heals: a killed pooled backend is dropped and replaced', async () => {
    const pool = testPool({ max: 2 })
    const killer = await testConnect()
    try {
      const { client, release } = await pool.connect()
      const pid = client.backendKey!.pid
      await killer.query('select pg_terminate_backend($1)', [pid])
      await delay(150)
      const err = await caught(() => client.query('select 1')) // dead client rejects
      expect(err).toBeInstanceOf(Error)
      release() // release sees state===closed -> deletes the dead conn
      const r = await pool.query('select 99 as v') // pool opens a fresh conn
      expect(pcell0(r)).toBe(99)
    } finally {
      await pool.end()
      await killer.end()
    }
  }, 15000)
})

// ============================================================================
describe('end() / shutdown under concurrency (no hang, all settle)', () => {
  test('end() while a query is in flight settles the in-flight promise and resolves', async () => {
    const c = await testConnect()
    const inflight = caught(() => c.query('select pg_sleep(10)'))
    await c.end()
    expect(await inflight).toBeInstanceOf(Error)
    expect(c.state).toBe('closed')
  }, 15000)

  test('end() called twice resolves the second time immediately', async () => {
    const c = await testConnect()
    await c.end()
    await c.end() // early return on state===closed
    expect(c.state).toBe('closed')
  })

  test('query() after end() rejects, does not hang', async () => {
    const c = await testConnect()
    await c.end()
    const err = await caught(() => c.query('select 1'))
    expect((err as Error).message).toMatch(/connection is closed/)
  })

  test('Pool.end() rejects parked waiters (no hung acquire)', async () => {
    // note: an older plan flagged this as a hang FOOTGUN, but the current
    // pool.ts (end(): `w.reject(err)`) actually settles waiters — assert that.
    const pool = testPool({ max: 1 })
    const held = await pool.acquire() // holds the only slot
    void held
    const waiter = caught(() => pool.acquire()) // parks in waiters
    await pool.end()
    expect(await waiter).toBeInstanceOf(Error)
  })

  test('Pool.end() then acquire() throws "pool is closed"', async () => {
    const pool = testPool({ max: 1 })
    await pool.end()
    const err = await caught(() => pool.acquire())
    expect((err as Error).message).toMatch(/pool is closed/)
  })
})

// ============================================================================
// CHAOS with a private mock PG server: deterministic mid-query socket drops,
// chunk-boundary reassembly, malformed frames, accept-then-close. None of these
// touch the shared cluster.
describe('CHAOS: mock-server partial / malformed / dropped writes', () => {
  const i32 = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(n); return b }
  const u16 = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(n); return b }
  const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])
  const srvMsg = (type: string, payload: Buffer = Buffer.alloc(0)) =>
    Buffer.concat([Buffer.from(type, 'latin1'), i32(payload.length + 4), payload])

  const HANDSHAKE = Buffer.concat([
    srvMsg('R', i32(0)), // AuthenticationOk
    srvMsg('K', Buffer.concat([i32(4242), i32(8888)])), // BackendKeyData
    srvMsg('Z', Buffer.from('I')), // ReadyForQuery (idle)
  ])
  // Canned response for `select 1` -> single int4 column 'x' = 1.
  const QUERY_RESPONSE = Buffer.concat([
    srvMsg('T', Buffer.concat([u16(1), cstr('x'), i32(0), u16(0), i32(23), u16(4), i32(-1), u16(0)])),
    srvMsg('D', Buffer.concat([u16(1), i32(1), Buffer.from('1')])),
    srvMsg('C', cstr('SELECT 1')),
    srvMsg('Z', Buffer.from('I')),
  ])

  // Start a mock server. `onQuery(sock)` runs the first time the client sends a
  // query batch (any data after the startup packet). Returns {port, close}.
  function mockServer(onQuery: (sock: net.Socket) => void): Promise<{ port: number; close: () => Promise<void> }> {
    const server = net.createServer((sock) => {
      let sawStartup = false
      sock.on('data', () => {
        if (!sawStartup) { sawStartup = true; sock.write(HANDSHAKE); return } // first chunk = startup
        onQuery(sock)
      })
      sock.on('error', () => { /* ignore client-side resets */ })
    })
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo
        resolve({
          port: addr.port,
          close: () => new Promise<void>((r) => server.close(() => r())),
        })
      })
    })
  }

  test('valid response written one byte at a time reassembles into a correct result', async () => {
    let fired = false
    const srv = await mockServer((sock) => {
      if (fired) return
      fired = true
      let i = 0
      const tick = () => {
        if (i < QUERY_RESPONSE.length) { sock.write(QUERY_RESPONSE.subarray(i, i + 1)); i++; setTimeout(tick, 0) }
      }
      tick()
    })
    const c = await connect({ host: '127.0.0.1', port: srv.port, user: 'x', password: '', database: 'x' })
    try {
      const r = await c.query('select 1')
      expect(cell0(r)).toBe(1) // framing across many 1-byte chunks stayed aligned
    } finally {
      await c.end()
      await srv.close()
    }
  })

  test('socket destroyed mid-query rejects the in-flight promise (no hang), state=closed', async () => {
    const srv = await mockServer((sock) => { sock.destroy() }) // drop instead of answering
    const c = await connect({ host: '127.0.0.1', port: srv.port, user: 'x', password: '', database: 'x' })
    try {
      const err = await caught(() => c.query('select 1'))
      expect(err).toBeInstanceOf(Error)
      expect(c.state).toBe('closed')
    } finally {
      await c.end()
      await srv.close()
    }
  })

  test('malformed frame (bad length) then close routes through fatal(): in-flight rejects, no uncaught throw', async () => {
    const srv = await mockServer((sock) => {
      sock.write(Buffer.from([0x44, 0, 0, 0, 3])) // 'D' with length=3 (< 4): Parser throws -> fatal()
      sock.end()
    })
    const c = await connect({ host: '127.0.0.1', port: srv.port, user: 'x', password: '', database: 'x' })
    try {
      const err = await caught(() => c.query('select 1'))
      expect((err as Error).message).toMatch(/invalid backend message length/)
      expect(c.state).toBe('closed')
    } finally {
      await c.end()
      await srv.close()
    }
  })

  test('server accepts TCP then closes before ReadyForQuery -> connect() rejects (not pending)', async () => {
    const server = net.createServer((sock) => { sock.destroy() }) // close immediately, no handshake
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as net.AddressInfo).port
    try {
      const err = await caught(() => connect({ host: '127.0.0.1', port, user: 'x', password: '', database: 'x', connectTimeout: 3000 }))
      expect(err).toBeInstanceOf(Error)
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  }, 10000)
})

// ============================================================================
describe('out-of-scope guards', () => {
  test('LISTEN/NOTIFY: NotificationResponse is silently ignored, connection stays usable', async () => {
    const listener = await testConnect()
    const notifier = await testConnect()
    try {
      const chan = 'cc_chan_' + process.pid
      await listener.query(`listen "${chan}"`)
      await notifier.query(`notify "${chan}", 'hello'`)
      await delay(100) // any 'A' message would arrive by now and be dropped (no LISTEN/NOTIFY support)
      const r = await listener.query('select 123 as v') // conn not wedged by the ignored notification
      expect(cell0(r)).toBe(123)
    } finally {
      await listener.end()
      await notifier.end()
    }
  })

  test('multi-statement string via extended protocol errors (no simple-query path)', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select 1; select 2'))
      expect(err).toBeInstanceOf(PgError)
    } finally { await c.end() }
  })
})

// ============================================================================
describe('roadmap: cancel / timeout / abort (not implemented)', () => {
  test.todo('per-query timeout { timeout } rejects after N ms and marks the conn broken', () => {})
  test.todo('AbortSignal: an aborted signal rejects the query and stops sending it', () => {})
  test.todo('out-of-band CancelRequest via backendKey rejects with 57014 query_canceled', () => {})
  test.todo('stream cancel issues CancelRequest instead of draining the full result server-side', () => {})
  test.todo('transaction helper sugar begin(fn) auto-COMMIT/ROLLBACK under concurrency', () => {})
})
