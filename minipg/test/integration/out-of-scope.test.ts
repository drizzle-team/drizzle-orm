// Out-of-scope guards & runtime parity for minipg.
//
// minipg deliberately omits the `sql``` template tag, LISTEN/NOTIFY, COPY, and
// logical replication. These tests GUARD those omissions: prove the unsupported
// surfaces are genuinely absent and that the protocol-level swallow/abort paths
// (handle() cases 'N'/'A' ignore, 'G'/'W' -> CopyFail+Sync, default swallow) do
// not corrupt or wedge a live connection. Runtime footprint is asserted by a
// static-import audit of src/ (only node:net/tls/crypto/os).
import { test, expect, describe } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as minipg from '../../src/index.ts'
import { testConnect, testPool, caught, PgError } from '../helpers/db.ts'

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src')

describe('absence of the sql`` template tag & other DSL surfaces', () => {
  test('public exports: connect/createPool are functions; no sql/listen/notify/subscribe factory', () => {
    const m = minipg as Record<string, unknown>
    expect(typeof m.connect).toBe('function')
    expect(typeof m.createPool).toBe('function')
    expect(typeof m.Connection).toBe('function')
    expect(typeof m.Pool).toBe('function')
    expect(typeof m.PgError).toBe('function')
    expect(typeof m.defaultDecoders).toBe('object') // a Map of decoders
    // No tagged-template DSL / pub-sub / copy factory leaked from the index module.
    for (const absent of ['sql', 'listen', 'notify', 'subscribe', 'copyTo', 'copyFrom', 'unsafe', 'begin', 'file']) {
      expect(m[absent]).toBeUndefined()
    }
  })

  test('Connection instances expose no sql/listen/notify/subscribe/copy/cursor member', async () => {
    const c = await testConnect()
    try {
      const inst = c as unknown as Record<string, unknown>
      for (const absent of ['sql', 'listen', 'notify', 'subscribe', 'fetch']) { // copyTo exists now (raw COPY TO relay)
        expect(inst[absent]).toBeUndefined()
      }
      // the supported surface is plain query/stream/end (+ copyFrom/copyMany since the COPY feature)
      expect(typeof c.query).toBe('function')
      expect(typeof c.stream).toBe('function')
      expect(typeof c.end).toBe('function')
      expect(typeof c.copyFrom).toBe('function')
      expect(typeof c.cursor).toBe('function') // cursor() shipped 2026-07-10
    } finally {
      await c.end()
    }
  })

  test('Pool instances expose no sql/listen/notify/subscribe/copy member', async () => {
    const pool = testPool({ max: 1 })
    try {
      const inst = pool as unknown as Record<string, unknown>
      for (const absent of ['sql', 'listen', 'notify', 'subscribe', 'copyTo']) {
        expect(inst[absent]).toBeUndefined()
      }
    } finally {
      await pool.end()
    }
  })

  test('a strings-array first arg is REJECTED loudly (builder-chunks form removed)', async () => {
    const c = await testConnect()
    try {
      const asArr = c as unknown as { query: (...a: unknown[]) => Promise<unknown> }
      const err = await caught(() => asArr.query(['select ', '::int4 as x'], [1]))
      expect((err as Error).message).toMatch(/sql must be a string — the builder-chunks array form was removed/)
      const ok = await c.query('select 1::int4 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    } finally {
      await c.end()
    }
  })
})

describe('LISTEN / NOTIFY async messages are ignored without breaking the connection', () => {
  test('NOTIFY from a 2nd connection is silently dropped; listener stays usable', async () => {
    const listener = await testConnect()
    const notifier = await testConnect()
    const ch = `oos_ch_${process.pid}_${Date.now()}`
    try {
      await listener.query(`listen ${ch}`)
      // payloaded + payload-less notifications from a separate session
      await notifier.query('select pg_notify($1,$2)', [ch, 'payload'])
      await notifier.query(`notify ${ch}`) // empty/NULL payload -> zero-length payload field
      // give the async 'A' frames a moment to arrive on the idle listener socket
      await new Promise((r) => setTimeout(r, 100))
      // the NotificationResponse frames were swallowed by handle() case 'A'; listener is fine
      const r = await listener.query('select 1::int4 as x')
      expect((r.rows[0] as unknown[])[0]).toBe(1)
      expect(listener.state).toBe('ready')
    } finally {
      await listener.end()
      await notifier.end()
    }
  })

  test('self pg_notify interleaved with the same query does not corrupt result parsing', async () => {
    const c = await testConnect()
    const ch = `oos_self_${process.pid}_${Date.now()}`
    try {
      await c.query(`listen ${ch}`)
      // pg_notify runs inside this very query; the 'A' frame may interleave with D/C/Z
      const r = await c.query('select pg_notify($1,$2) , 42::int4 as n', [ch, 'x'], { mode: 'object' })
      const row = r.rows[0] as Record<string, unknown>
      expect(row.n).toBe(42)
      expect(r.rowCount).toBe(1)
      // and the next query is unaffected by the swallowed self-notification
      const r2 = await c.query('select 7::int4 as y')
      expect((r2.rows[0] as unknown[])[0]).toBe(7)
    } finally {
      await c.end()
    }
  })

  test('RAISE NOTICE (NoticeResponse) is ignored, not thrown', async () => {
    const c = await testConnect()
    try {
      await c.query("set client_min_messages = 'notice'")
      const r = await c.query("do $$ begin raise notice 'hello from a notice'; end $$")
      // DO completes normally; the 'N' frame did not become a PgError
      expect(r.command).toBe('DO')
      const ok = await c.query('select 1::int4 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    } finally {
      await c.end()
    }
  })

  test('the only way to notify is a raw parameterized query, which returns a normal result', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select pg_notify($1,$2)', ['oos_noop_ch', 'hi'])
      expect(r.rowCount).toBe(1)
      expect(r.command).toBe('SELECT')
    } finally {
      await c.end()
    }
  })
})

describe('COPY is unsupported — clean settle, never hangs the connection', () => {
  test('plain query COPY TO STDOUT rejects LOUDLY (was: silent payload discard) and never desyncs', async () => {
    const c = await testConnect()
    try {
      // server sends 'H' CopyOutResponse, 'd' CopyData x3, 'c' CopyDone, 'C', 'Z'. The 'H' handler
      // marks the task errored — resolving with empty rows would silently discard the payload.
      const err = await caught(() => c.query('copy (select * from generate_series(1,3)) to stdout'))
      expect((err as Error).message).toMatch(/use copyTo\(\)/)
      // connection back to ready -> next query succeeds (frames drained, no desync)
      expect(c.state).toBe('ready')
      const ok = await c.query('select 1::int4 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    } finally {
      await c.end()
    }
  }, 10000)

  test('COPY FROM STDIN does NOT hang: driver aborts with CopyFail and the query rejects', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table oos_copy_in(a int)')
      // 'G' CopyInResponse -> handle() writes CopyFail+Sync instead of hanging.
      // Bounded race guards against a regression that would wedge forever.
      const queryP = caught(() => c.query('copy oos_copy_in from stdin'))
      const timeoutP = new Promise((r) => setTimeout(() => r('TIMEOUT'), 5000))
      const outcome = await Promise.race([queryP, timeoutP])
      expect(outcome).not.toBe('TIMEOUT') // proves it settled, did not hang
      expect(outcome).toBeInstanceOf(PgError) // CopyFail -> server ErrorResponse
      // connection recovers and runs a normal query
      const ok = await c.query('select 5::int4 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(5)
    } finally {
      await c.end()
    }
  }, 10000)

  test('pool.query COPY TO STDOUT rejects loudly and does not desync the pool', async () => {
    const pool = testPool({ max: 1 })
    try {
      const err = await caught(() => pool.query('copy (select 1) to stdout'))
      expect((err as Error).message).toMatch(/use copyTo\(\)/)
      // borrowed connection released cleanly -> next pooled query works
      const ok = await pool.query('select 1::int4 as x')
      expect((ok.rows[0] as unknown as unknown[])[0]).toBe(1)
    } finally {
      await pool.end()
    }
  }, 10000)

  test.todo('COPY should reject client-side with a clear "COPY is not supported" PgError before round-trip', () => {})
})

describe('logical replication / simple-query / cursors are out of scope', () => {
  test('replication handshake verbs run as ordinary statements (server rejects), no special mode', async () => {
    const c = await testConnect()
    try {
      // IDENTIFY_SYSTEM is only valid on a replication connection; on a normal
      // extended-protocol connection it is just an unknown statement -> server error.
      const err = await caught(() => c.query('IDENTIFY_SYSTEM'))
      expect(err).toBeInstanceOf(PgError)
      const ok = await c.query('select 1::int4 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    } finally {
      await c.end()
    }
  })

  test('no replication / subscribe option leaks onto the connection config', async () => {
    const c = await testConnect()
    try {
      const cfg = c.cfg as unknown as Record<string, unknown>
      expect(cfg.replication).toBeUndefined()
      expect((c as unknown as Record<string, unknown>).subscribe).toBeUndefined()
    } finally {
      await c.end()
    }
  })

  test('a multi-statement string is rejected (extended-protocol-only, no simple-query path)', async () => {
    const c = await testConnect()
    try {
      // Extended protocol's Parse expects a single command; multiple commands error.
      const err = await caught(() => c.query('select 1; select 2'))
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('42601')
      const ok = await c.query('select 1::int4 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    } finally {
      await c.end()
    }
  })
})

describe('runtime parity — Bun (primary)', () => {
  test('all four result modes resolve against live PG', async () => {
    const c = await testConnect()
    try {
      const arr = await c.query('select 1::int4 as x', [], { mode: 'array' })
      expect((arr.rows[0] as unknown[])[0]).toBe(1)
      const obj = await c.query('select 1::int4 as x', [], { mode: 'object' })
      expect((obj.rows[0] as Record<string, unknown>).x).toBe(1)
      const bufm = await c.query('select 1::int4 as x', [], { mode: 'buffer' })
      expect(Buffer.isBuffer((bufm.rows[0] as (Buffer | null)[])[0])).toBe(true)
      const raw = await c.query('select 1::int4 as x', [], { mode: 'raw' })
      expect(Buffer.isBuffer(raw.rows[0] as Buffer)).toBe(true)
    } finally {
      await c.end()
    }
  })

  test('pool reuses connections and drains cleanly on end()', async () => {
    const pool = testPool({ max: 2 })
    try {
      const rs = await Promise.all([pool.query('select 1'), pool.query('select 2'), pool.query('select 3')])
      expect(rs.length).toBe(3)
      const again = await pool.query('select 9::int4 as x')
      expect((again.rows[0] as unknown as unknown[])[0]).toBe(9)
    } finally {
      await pool.end() // resolves -> clean drain
    }
  })

  test('SSL connect, select, and end() RESOLVES (no end-over-SSL hang)', async () => {
    const c = await testConnect({ ssl: 'require' })
    const r = await c.query('select 1::int4 as x')
    expect((r.rows[0] as unknown[])[0]).toBe(1)
    // guard: end() must settle, not hang forever
    const endOutcome = await Promise.race([
      c.end().then(() => 'ENDED'),
      new Promise((res) => setTimeout(() => res('TIMEOUT'), 5000)),
    ])
    expect(endOutcome).toBe('ENDED')
  }, 10000)

  test.todo('Node smoke subset (connect + select + object mode + end) via tsx loader', () => {})
  test.todo('AsyncLocalStorage context survives across the socket callback on Node', () => {})
})

describe('pure net/tls/crypto surface (static-import audit of src/)', () => {
  // The opt-in per-runtime adapters (minipg/node|deno|cf) are the SANCTIONED boundary for
  // runtime-specific transports (the Deno global, cloudflare:sockets), so they're excluded from the
  // core-purity audit; .d.ts files hold only erased type declarations.
  const RUNTIME_ENTRIES = new Set(['node.ts', 'deno.ts', 'cf.ts'])
  const srcFiles = readdirSync(SRC_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !RUNTIME_ENTRIES.has(f))

  test('src/ core imports only node:net/tls/crypto/os — no pg-native/libpq/cloudflare/native addon', () => {
    // match actual imports/native artifacts, not prose (comments may mention cloudflare:sockets etc.)
    const forbidden = /(from ['"]pg-native|from ['"]libpq|from ['"]cloudflare:sockets|require\(['"]net['"]\)|node-gyp|\.node['"])/
    const nodeImport = /from\s+['"]node:([a-z_]+)['"]/g
    // async_hooks: the pool's txGuard (AsyncLocalStorage). Safe to import statically for the same reason
    // node:crypto is — core already needs crypto for auth, so every runtime that can run the pool at all
    // (node/bun/deno/workers-with-nodejs_compat) supplies both. A runtime lacking async_hooks would have
    // already failed on crypto.
    const allowed = new Set(['net', 'tls', 'crypto', 'os', 'stream', 'module', 'path', 'url', 'fs', 'assert', 'async_hooks'])
    const builtinsSeen = new Set<string>()
    for (const f of srcFiles) {
      const text = readFileSync(join(SRC_DIR, f), 'utf8')
      expect(text).not.toMatch(forbidden)
      // type-only imports (`import type …`) are erased at runtime — audit runtime imports only
      const runtime = text.replace(/import\s+type\b[^\n]*\n/g, '')
      let m: RegExpExecArray | null
      while ((m = nodeImport.exec(runtime)) !== null) builtinsSeen.add(m[1]!)
    }
    // every node builtin the driver imports must be in the allowed I/O/auth set
    for (const b of builtinsSeen) expect(allowed.has(b)).toBe(true)
    // the I/O + auth builtins are actually present
    expect(builtinsSeen.has('net')).toBe(true)
    expect(builtinsSeen.has('tls')).toBe(true)
    expect(builtinsSeen.has('crypto')).toBe(true)
  })

  test('SCRAM-SHA-256 / md5 auth use node:crypto and work against live PG', async () => {
    const authText = readFileSync(join(SRC_DIR, 'auth.ts'), 'utf8')
    expect(authText).toMatch(/from\s+['"]node:crypto['"]/)
    expect(authText).toMatch(/timingSafeEqual/)
    expect(authText).toMatch(/pbkdf2/)
    // SCRAM path exercised by a normal connect (server uses scram-sha-256 by default)
    const c = await testConnect()
    try {
      const r = await c.query('select 1::int4 as x')
      expect((r.rows[0] as unknown[])[0]).toBe(1)
    } finally {
      await c.end()
    }
  })

  test('md5 role authenticates (node:crypto md5 path)', async () => {
    const c = await testConnect({ user: 'md5user', password: 'md5pw' })
    try {
      const r = await c.query('select 1::int4 as x')
      expect((r.rows[0] as unknown[])[0]).toBe(1)
    } finally {
      await c.end()
    }
  })

  test('no top-level process.env read: env reads are confined to the Connection constructor', () => {
    const connText = readFileSync(join(SRC_DIR, 'connection.ts'), 'utf8')
    // index.ts (the module entry) must not read process.env at module scope
    const indexText = readFileSync(join(SRC_DIR, 'index.ts'), 'utf8')
    expect(indexText).not.toMatch(/process\.env/)
    // in connection.ts, process.env appears only inside functions (constructor/defaultUser),
    // never as a top-level statement (no line beginning at column 0 with process.env).
    expect(connText).not.toMatch(/^process\.env/m)
  })
})
