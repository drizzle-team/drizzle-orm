// TLS / SSL behavior for minipg — grounded in src/connection.ts startSSL().
// The cluster has SSL ENABLED (self-signed cert, CN=localhost) and also accepts
// plaintext. We exercise: config coercion, the SSLRequest framing, the live TLS
// handshake (+ pg_stat_ssl), tls.connect option merging (via a spy that calls
// through), self-signed / custom-CA verification, malformed cert material, and
// the N / unexpected-byte / timeout negotiation paths via a stub TCP server.
import { test, expect, describe, spyOn } from 'bun:test'
import net from 'node:net'
import tls from 'node:tls'
import { Duplex } from 'node:stream'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { connect, createPool, Connection, PgError } from '../../src/index.ts'
import { W } from '../../src/protocol.ts'
import { testConnect, caught, SERVER_CA_PATH, TEST_CONFIG } from '../helpers/db.ts'

// The server's own self-signed cert acts as its own CA (Issuer === Subject === CN=localhost).
function readServerCa(): string {
  const raw = fs.readFileSync(SERVER_CA_PATH, 'utf8')
  const m = raw.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)
  return m ? m[0] : raw
}
const SERVER_CA = readServerCa()

// An UNRELATED self-signed CA generated at runtime, used to prove a cert that is
// NOT signed by the supplied CA is rejected. Generated lazily; if openssl is
// unavailable the dependent test is skipped.
const altCa: string = (() => {
  try {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'minipg-tls-'))
    const key = `${scratch}/alt-ca.key`
    const crt = `${scratch}/alt-ca.crt`
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', crt, '-days', '2', '-subj', '/CN=not-the-server'],
      { stdio: 'ignore' })
    return fs.readFileSync(crt, 'utf8')
  } catch { return '' }
})()

// Stub TCP server that reads the 8-byte SSLRequest then runs `onRequest(sock)`.
function makeStub(onRequest: (sock: net.Socket) => void): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => { sock.once('data', () => onRequest(sock)) })
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo
      resolve({ port: addr.port, close: () => { try { srv.close() } catch { /* */ } } })
    })
  })
}

// ── SSL config coercion (no socket) ────────────────────────────────────────
describe('ssl config coercion', () => {
  test('ssl: true is stored verbatim on cfg', () => {
    expect(new Connection({ ssl: true }).cfg.ssl).toBe(true)
  })
  test('ssl: false is honored', () => {
    expect(new Connection({ ssl: false }).cfg.ssl).toBe(false)
  })
  test('omitted ssl defaults to false (config.ssl ?? false)', () => {
    expect(new Connection({}).cfg.ssl).toBe(false)
  })
  test('ssl: undefined coerces to false', () => {
    expect(new Connection({ ssl: undefined }).cfg.ssl).toBe(false)
  })
  test("ssl: 'require' is preserved as a non-boolean string (not falsey)", () => {
    expect(new Connection({ ssl: 'require' }).cfg.ssl).toBe('require')
  })
  test('ssl object is preserved by identity (fields reach tls.connect later)', () => {
    const o = { rejectUnauthorized: false, servername: 'x' }
    expect(new Connection({ ssl: o }).cfg.ssl).toBe(o)
  })
})

// ── SSLRequest framing (writer) ────────────────────────────────────────────
describe('SSLRequest packet framing', () => {
  test('W.sslRequest() is exactly 8 bytes: length 8 + magic code 80877103', () => {
    const buf = W.sslRequest()
    expect(buf.length).toBe(8)
    expect(buf.readInt32BE(0)).toBe(8)
    expect(buf.readInt32BE(4)).toBe(80877103) // 0x04d2162f
  })
})

// ── Live TLS handshake against the SSL-enabled cluster ──────────────────────
describe('live TLS handshake + pg_stat_ssl', () => {
  test('a pool fails fast when verification rejects the self-signed certificate', async () => {
    const pool = createPool({ ...TEST_CONFIG, ssl: 'verify-full' })
    const t0 = Date.now()
    try { expect(await caught(() => pool.acquire())).toMatchObject({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }) }
    finally { await pool.end() }
    expect(Date.now() - t0).toBeLessThan(3000)
  })

  test('ssl: true completes the handshake and runs SELECT 1 (no `in` TypeError)', async () => {
    const c = await testConnect({ ssl: true })
    try {
      const r = await c.query('select 1 as x')
      expect((r.rows[0] as unknown[])[0]).toBe(1)
    } finally { await c.end() }
  })

  test('ssl: true -> pg_stat_ssl reports ssl = true for our backend', async () => {
    const c = await testConnect({ ssl: true })
    try {
      const r = await c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()')
      expect((r.rows[0] as unknown[])[0]).toBe(true)
    } finally { await c.end() }
  })

  test("ssl: 'require' (string) enables TLS — pg_stat_ssl true", async () => {
    const c = await testConnect({ ssl: 'require' })
    try {
      const r = await c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()')
      expect((r.rows[0] as unknown[])[0]).toBe(true)
    } finally { await c.end() }
  })

  test('ssl: false -> plaintext, pg_stat_ssl ssl = false', async () => {
    const c = await testConnect({ ssl: false })
    try {
      const r = await c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()')
      expect((r.rows[0] as unknown[])[0]).toBe(false)
    } finally { await c.end() }
  })

  test('omitted ssl -> plaintext, pg_stat_ssl ssl = false', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()')
      expect((r.rows[0] as unknown[])[0]).toBe(false)
    } finally { await c.end() }
  })

  test('writes flow through the upgraded TLSSocket: several queries succeed in a row', async () => {
    const c = await testConnect({ ssl: true })
    try {
      for (let i = 0; i < 3; i++) {
        const r = await c.query('select $1::int as n', [i])
        expect((r.rows[0] as unknown[])[0]).toBe(i)
      }
    } finally { await c.end() }
  })
})

// ── tls.connect option merging (spy that calls through to a real handshake) ──
describe('tls.connect merged options', () => {
  test('ssl: true forces { rejectUnauthorized:false }, servername undefined for an IP host, exactly ONE tls.connect (in-place upgrade)', async () => {
    const spy = spyOn(tls, 'connect')
    let c: Connection | null = null
    try {
      c = await testConnect({ ssl: true }) // host is 127.0.0.1 (an IP)
      expect(spy.mock.calls.length).toBe(1) // single in-place upgrade, not a 2nd connection
      const opts = spy.mock.calls[0]![0] as Record<string, unknown>
      expect(opts.rejectUnauthorized).toBe(false)
      expect(opts.servername).toBeUndefined() // net.isIP('127.0.0.1') -> no SNI / no altname check
      expect(opts.socket).toBeDefined() // upgrades the existing socket
    } finally { spy.mockRestore(); if (c) await c.end() }
  })

  test("ssl: 'require' forces rejectUnauthorized:false", async () => {
    const spy = spyOn(tls, 'connect')
    let c: Connection | null = null
    try {
      c = await testConnect({ ssl: 'require' })
      const opts = spy.mock.calls[0]![0] as Record<string, unknown>
      expect(opts.rejectUnauthorized).toBe(false)
    } finally { spy.mockRestore(); if (c) await c.end() }
  })

  test('connecting by hostname passes servername === host (SNI)', async () => {
    const spy = spyOn(tls, 'connect')
    let c: Connection | null = null
    try {
      c = await testConnect({ host: 'localhost', ssl: { rejectUnauthorized: false } })
      const opts = spy.mock.calls[0]![0] as Record<string, unknown>
      expect(opts.servername).toBe('localhost')
    } finally { spy.mockRestore(); if (c) await c.end() }
  })

  test('explicit ssl.servername overrides the host-derived value (spread wins)', async () => {
    const spy = spyOn(tls, 'connect')
    let c: Connection | null = null
    try {
      // rejectUnauthorized:false so the bogus servername does not fail the handshake.
      c = await testConnect({ ssl: { rejectUnauthorized: false, servername: 'override.example' } })
      const opts = spy.mock.calls[0]![0] as Record<string, unknown>
      expect(opts.servername).toBe('override.example')
    } finally { spy.mockRestore(); if (c) await c.end() }
  })

  test('an ssl object with only `ca` keeps verification ON (rejectUnauthorized:true, not silently disabled)', async () => {
    const spy = spyOn(tls, 'connect')
    let c: Connection | null = null
    try {
      // ca + servername:'localhost' so verification actually succeeds against CN=localhost.
      c = await testConnect({ ssl: { ca: SERVER_CA, servername: 'localhost' } })
      const opts = spy.mock.calls[0]![0] as Record<string, unknown>
      expect(opts.ca).toBe(SERVER_CA)
      expect(opts.rejectUnauthorized).toBe(true) // verification explicitly ON (never silently false)
    } finally { spy.mockRestore(); if (c) await c.end() }
  })

  test('user checkServerIdentity is forwarded and invoked during a verified handshake', async () => {
    const spy = spyOn(tls, 'connect')
    let called = false
    const csi = (_host: string, _cert: tls.PeerCertificate): Error | undefined => { called = true; return undefined }
    let c: Connection | null = null
    try {
      c = await testConnect({ ssl: { ca: SERVER_CA, rejectUnauthorized: true, servername: 'localhost', checkServerIdentity: csi } })
      const opts = spy.mock.calls[0]![0] as Record<string, unknown>
      expect(opts.checkServerIdentity).toBe(csi)
      expect(called).toBe(true) // actually ran for hostname verification
    } finally { spy.mockRestore(); if (c) await c.end() }
  })

  test('ssl.minVersion (TLSv1.3 restriction) passes through and still completes', async () => {
    const spy = spyOn(tls, 'connect')
    let c: Connection | null = null
    try {
      c = await testConnect({ ssl: { rejectUnauthorized: false, minVersion: 'TLSv1.3' } })
      const opts = spy.mock.calls[0]![0] as Record<string, unknown>
      expect(opts.minVersion).toBe('TLSv1.3')
      const r = await c.query('select 1 as x')
      expect((r.rows[0] as unknown[])[0]).toBe(1)
    } finally { spy.mockRestore(); if (c) await c.end() }
  })

  test('FOOTGUN: a non-enumerable `key` on the ssl object is dropped by the object spread (does NOT reach tls.connect)', async () => {
    const spy = spyOn(tls, 'connect')
    const sslObj: Record<string, unknown> = { rejectUnauthorized: false }
    Object.defineProperty(sslObj, 'key', { value: 'SECRET-KEY-PEM', enumerable: false })
    let c: Connection | null = null
    try {
      c = await testConnect({ ssl: sslObj as unknown as tls.ConnectionOptions })
      const opts = spy.mock.calls[0]![0] as Record<string, unknown>
      // `{ ...base, ...this.cfg.ssl }` copies only ENUMERABLE own props -> key is lost.
      expect(opts.key).toBeUndefined()
    } finally { spy.mockRestore(); if (c) await c.end() }
  })
})

// ── Self-signed / verification semantics ───────────────────────────────────
describe('self-signed cert + rejectUnauthorized', () => {
  test('ssl: { rejectUnauthorized: false } connects to the self-signed server', async () => {
    const c = await testConnect({ ssl: { rejectUnauthorized: false } })
    try {
      const r = await c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()')
      expect((r.rows[0] as unknown[])[0]).toBe(true)
    } finally { await c.end() }
  })

  test('ssl: { ca, rejectUnauthorized: true, servername: "localhost" } verifies and connects (cert acts as its own CA)', async () => {
    const c = await testConnect({ ssl: { ca: SERVER_CA, rejectUnauthorized: true, servername: 'localhost' } })
    try {
      const r = await c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()')
      expect((r.rows[0] as unknown[])[0]).toBe(true)
    } finally { await c.end() }
  })

  test('ssl: { rejectUnauthorized: true } WITHOUT ca rejects the self-signed cert', async () => {
    const err = await caught(() => testConnect({ ssl: { rejectUnauthorized: true } }))
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/self[- ]signed|unable to verify|certificate/i)
  })

  test('a bare ssl: {} object defaults to Node verification (rejectUnauthorized true) and rejects the self-signed cert', async () => {
    const err = await caught(() => testConnect({ ssl: {} }))
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/self[- ]signed|unable to verify|certificate|Hostname/i)
  })

  test.skipIf(!altCa)('a cert NOT signed by the supplied CA is rejected (wrong/unrelated CA)', async () => {
    const err = await caught(() => testConnect({ ssl: { ca: altCa, rejectUnauthorized: true, servername: 'localhost' } }))
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/self[- ]signed|unable to verify|certificate/i)
  })
})

// ── Malformed cert material -> catchable rejection, never an uncaughtException ─
describe('sslmode named strings (live cluster, self-signed cert)', () => {
  // The cluster cert is self-signed, so the string modes (which verify against the SYSTEM CA
  // store, not a supplied CA) must REJECT it — proving they actually verify (unlike 'require').
  test("'verify-full' (string) rejects the self-signed server", async () => {
    const err = await caught(() => testConnect({ ssl: 'verify-full' }))
    expect((err as Error).message).toMatch(/self.?signed|unable to (get|verify)|certificate/i)
  })
  test("'verify-ca' (string) rejects the self-signed server", async () => {
    const err = await caught(() => testConnect({ ssl: 'verify-ca' }))
    expect((err as Error).message).toMatch(/self.?signed|unable to (get|verify)|certificate/i)
  })
  test('verify-ca semantics: chain verified, hostname skipped -> connects despite a wrong servername', async () => {
    let c: Connection | null = null
    try {
      c = await testConnect({ ssl: { ca: SERVER_CA, rejectUnauthorized: true, servername: 'wrong.example', checkServerIdentity: () => undefined } })
      expect(((await c.query('select 1 as v')).rows[0] as unknown[])[0]).toBe(1)
    } finally { if (c) await c.end() }
  })
  test("'disable' connects in plaintext (pg_stat_ssl ssl = false)", async () => {
    let c: Connection | null = null
    try {
      c = await testConnect({ ssl: 'disable' })
      const r = await c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()', [], { mode: 'object' })
      expect((r.rows[0] as { ssl: boolean }).ssl).toBe(false)
    } finally { if (c) await c.end() }
  })
})

describe('malformed cert material', () => {
  test('garbage `ca` PEM does not connect (rejects, no crash)', async () => {
    const err = await caught(() => testConnect({ ssl: { ca: 'not a real pem at all', rejectUnauthorized: true, servername: 'localhost' } }))
    expect(err).toBeInstanceOf(Error)
  })

  test('garbage `cert`/`key` PEM surfaces as a connect rejection (tls.connect throw is caught)', async () => {
    const err = await caught(() => testConnect({ ssl: { cert: 'garbage-cert', key: 'garbage-key', rejectUnauthorized: false } }))
    expect(err).toBeInstanceOf(Error)
  })
})

// ── SSLRequest negotiation: N / unexpected byte / timeout (stub TCP server) ──
describe('SSL negotiation responses (stub server)', () => {
  test("ssl: 'require' against a server replying 'N' rejects with 'server does not support TLS'", async () => {
    const stub = await makeStub((sock) => sock.write(Buffer.from('N')))
    try {
      const err = await caught(() => testConnect({ port: stub.port, ssl: 'require', connectTimeout: 3000 }))
      expect((err as Error).message).toMatch(/server does not support TLS/)
    } finally { stub.close() }
  })

  test("ssl: true against a server replying 'N' rejects with 'server does not support TLS'", async () => {
    const stub = await makeStub((sock) => sock.write(Buffer.from('N')))
    try {
      const err = await caught(() => testConnect({ port: stub.port, ssl: true, connectTimeout: 3000 }))
      expect((err as Error).message).toMatch(/server does not support TLS/)
    } finally { stub.close() }
  })

  test("an ssl OBJECT against a server replying 'N' fails closed (no silent plaintext downgrade)", async () => {
    const stub = await makeStub((sock) => sock.write(Buffer.from('N'))) // declines TLS
    try {
      const err = await caught(() => testConnect({ port: stub.port, ssl: { rejectUnauthorized: false }, connectTimeout: 500 }))
      // any requested TLS mode (incl. an object) now fails closed instead of downgrading.
      expect((err as Error).message).toMatch(/does not support TLS/)
    } finally { stub.close() }
  })

  test("an unexpected first byte ('E') rejects with 'unexpected SSL response byte'", async () => {
    const stub = await makeStub((sock) => sock.write(Buffer.from('E')))
    try {
      const err = await caught(() => testConnect({ port: stub.port, ssl: true, connectTimeout: 3000 }))
      expect((err as Error).message).toMatch(/unexpected SSL response byte: E/)
    } finally { stub.close() }
  })

  test("connect timeout fires when the server sends 'S' but stalls before the TLS handshake", async () => {
    const stub = await makeStub((sock) => { sock.write(Buffer.from('S')) /* never speaks TLS */ })
    try {
      const err = await caught(() => testConnect({ port: stub.port, ssl: true, connectTimeout: 500 }))
      expect((err as Error).message).toMatch(/connect timeout after 500ms/)
    } finally { stub.close() }
  })
})

// ── API surface unchanged with SSL on ──────────────────────────────────────
describe('API surface over TLS', () => {
  test('connect/query/stream/end all work over an encrypted socket', async () => {
    const c = await testConnect({ ssl: true })
    try {
      expect(typeof c.query).toBe('function')
      expect(typeof c.stream).toBe('function')
      const seen: number[] = []
      for await (const row of c.stream('select g from generate_series(1,3) g')) {
        seen.push((row as unknown[])[0] as number)
      }
      expect(seen).toEqual([1, 2, 3])
      expect(c.backendKey).not.toBeNull()
    } finally { await c.end() }
  })

  test('a backend error over TLS surfaces as a catchable PgError, connection recovers', async () => {
    const c = await testConnect({ ssl: true })
    try {
      const err = await caught(() => c.query('select * from no_such_table_minipg_tls'))
      expect(err).toBeInstanceOf(PgError)
      const ok = await c.query('select 7 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(7)
    } finally { await c.end() }
  })
})

// ── Roadmap / unimplemented (kept green as todos) ──────────────────────────
describe('roadmap: SSL features not yet implemented', () => {
  test.todo('connection-string ?sslmode=disable/require/no-verify parsing', () => {})
  // sslmode=verify-ca / verify-full named modes -> IMPLEMENTED; see the "sslmode named strings" describe.
  test.todo('sslnegotiation=direct (PG17 direct-TLS) + ALPN "postgresql"', () => {})
  test.todo('PGSSLMODE / PGSSLCERT / PGSSLKEY / PGSSLROOTCERT env handling', () => {})
  test.todo('sslmode=prefer: attempt SSL then transparently fall back on N', () => {})
  test.todo('sslrootcert=system loads OS trust roots for verify-full', () => {})
  test.todo('fused S + ServerHello in one TCP segment (once-data only reads buf[0])', () => {})
  test.todo('SCRAM-SHA-256-PLUS channel binding over TLS', () => {})
})

describe('SCRAM channel binding (SCRAM-SHA-256-PLUS, tls-server-end-point)', () => {
  test('channel_binding=require over TLS connects — Postgres itself verifies the binding bytes', async () => {
    // The strongest possible check: the server recomputes tls-server-end-point from ITS cert and
    // validates our c= inside the signed SCRAM exchange. Wrong hash/encoding => auth failure.
    const c = await testConnect({ ssl: true, channelBinding: 'require' })
    try { expect((await c.query('select 1 as ok', [], { mode: 'object' })).rows[0]).toEqual({ ok: 1 }) } finally { await c.end() }
  }, 10000)

  test("default 'prefer' binds automatically over TLS; 'disable' still connects plain", async () => {
    const bound = await testConnect({ ssl: true })
    try { expect((await bound.query('select 2 as ok', [], { mode: 'object' })).rows[0]).toEqual({ ok: 2 }) } finally { await bound.end() }
    const plain = await testConnect({ ssl: true, channelBinding: 'disable' })
    try { expect((await plain.query('select 3 as ok', [], { mode: 'object' })).rows[0]).toEqual({ ok: 3 }) } finally { await plain.end() }
  }, 10000)

  // A custom transport terminates its own TLS, so whether binding is possible depends on what the
  // factory resolves to — not something the constructor can know. Both directions are covered here.
  describe('require over a CUSTOM socket transport', () => {
    // plain TCP -> SSLRequest -> 'S' -> tls.connect on the same socket: what any self-TLS transport does
    const starttls = () => new Promise<import('node:tls').TLSSocket>((resolve, reject) => {
      const { host, port } = TEST_CONFIG as { host: string; port: number }
      const raw = net.connect({ host, port }, () => {
        const req = Buffer.alloc(8); req.writeInt32BE(8, 0); req.writeInt32BE(80877103, 4)
        raw.write(req)
        raw.once('data', (b: Buffer) => {
          if (b[0] !== 0x53) return reject(new Error('server refused TLS'))
          const sec = tls.connect({ socket: raw, rejectUnauthorized: false, servername: 'localhost' })
          sec.once('secureConnect', () => resolve(sec)); sec.once('error', reject)
        })
      })
      raw.once('error', reject)
    })

    test('CONNECTS when the transport exposes the certificate (node TLSSocket already does)', async () => {
      // The server recomputes tls-server-end-point from ITS cert inside the signed SCRAM exchange, so
      // reaching 'ready' at all proves the binding bytes matched — a custom socket really is bound here.
      const { user, password, database } = TEST_CONFIG as { user: string; password: string; database: string }
      const c = await connect({ user, password, database, ssl: false, channelBinding: 'require', socket: starttls })
      try {
        const r = await c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()', [], { mode: 'object' })
        expect(r.rows[0]).toEqual({ ssl: true })
      } finally { await c.end() }
    }, 10000)

    test('REFUSED at auth when the transport hides it, naming what a transport must provide', async () => {
      const hidden = async () => {
        const sec = await starttls() // same TLS session, stripped of the cert accessors
        const d = new Duplex({ read() {}, write(chunk, _e, cb) { sec.write(chunk, cb) } })
        sec.on('data', (b) => d.push(b)); sec.on('close', () => d.push(null)); sec.on('error', (e) => d.destroy(e))
        return d
      }
      const { user, password, database } = TEST_CONFIG as { user: string; password: string; database: string }
      const err = await caught(() => connect({ user, password, database, ssl: false, channelBinding: 'require', socket: hidden }))
      const msg = (err as Error).message
      expect(msg).toMatch(/does not expose the server certificate/)
      expect(msg).not.toMatch(/node TLS only/) // it is NOT node-TLS-only any more
      // The remedy is the point of this message, so pin it exactly as styled: the two accessors a
      // transport may provide, and the stance to fall back to. A looser /getPeerCertificate/ passes
      // whether or not the identifiers are actually spelled out, which is what it has to prove.
      expect(msg).toContain('`getPeerX509Certificate()`')
      expect(msg).toContain('`getPeerCertificate(true)`')
      expect(msg).toContain('`raw` DER')
      expect(msg).toContain('`channel_binding=prefer`')
    }, 10000)

    test('plain TCP with no socket at all is still refused up front (nothing to wait for)', async () => {
      const err = await caught(() => connect({ ...(TEST_CONFIG as object), ssl: false, channelBinding: 'require' }))
      expect((err as Error).message).toMatch(/channel_binding=require needs TLS/)
    })
  })

  test('replication() binds too: require over TLS on the walsender', async () => {
    const { replication } = await import('../../src/index.ts')
    const { TEST_CONFIG } = await import('../helpers/db.ts')
    const repl = await replication({ ...(TEST_CONFIG as object), ssl: true, channelBinding: 'require' })
    try {
      const sys = await repl.identify()
      expect(sys.dbname).toBe('testdb')
    } finally { repl.end() }
  }, 10000)

  test('tls-server-end-point: the ASN.1 walk finds the cert signature hash; SCRAM encodes the binding', async () => {
    const { tlsServerEndPoint, parseSaslMechanisms, scram } = await import('../../src/auth.ts')
    // the cluster cert is sha256WithRSAEncryption (openssl req default) -> hash = sha256(DER)
    const der = Buffer.from(SERVER_CA.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, ''), 'base64')
    const cb = tlsServerEndPoint(der)
    expect(cb).not.toBeNull()
    expect(cb!.length).toBe(32)
    const { createHash } = await import('node:crypto')
    expect(cb!.equals(createHash('sha256').update(der).digest())).toBe(true)

    expect(parseSaslMechanisms(Buffer.concat([Buffer.from([0, 0, 0, 10]), Buffer.from('SCRAM-SHA-256\0SCRAM-SHA-256-PLUS\0\0')])))
      .toEqual(['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'])

    // -PLUS state machine: gs2 header + c= carry the binding; 'y' flag encodes capable-but-unoffered
    const plus = scram('pw', { cbData: Buffer.from('CBCB') })
    expect(plus.mechanism).toBe('SCRAM-SHA-256-PLUS')
    expect(plus.clientFirst.startsWith('p=tls-server-end-point,,n=*,r=')).toBe(true)
    const nonce = plus.clientFirst.split('r=')[1]!
    const final = plus.continue(`r=${nonce}SRV,s=${Buffer.from('salt').toString('base64')},i=4096`)
    expect(final.split(',')[0]).toBe('c=' + Buffer.concat([Buffer.from('p=tls-server-end-point,,'), Buffer.from('CBCB')]).toString('base64'))
    const y = scram('pw', { gs2: 'y' })
    expect(y.clientFirst.startsWith('y,,')).toBe(true)
    const yNonce = y.clientFirst.split('r=')[1]!
    expect(y.continue(`r=${yNonce}SRV,s=${Buffer.from('salt').toString('base64')},i=4096`).split(',')[0]).toBe('c=eSws') // base64('y,,')
  })
})
