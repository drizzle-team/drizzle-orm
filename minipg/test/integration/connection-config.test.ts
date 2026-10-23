// Domain: "connection-config" — how Connection normalizes ConnectConfig, resolves
// PG* env vars / OS defaults, builds the startup packet, and settles connect
// success/failure. Grounded in src/connection.ts (object-only config; no URL parser).
import net from 'node:net'
import os from 'node:os'
import { test, expect, describe, afterAll } from 'bun:test'
import { Connection, connect, PgError } from '../../src/index.ts'
import { TEST_CONFIG, testConnect, caught } from '../helpers/db.ts'

// --- env sandboxing: save/clear/restore the PG* keys minipg might read ---
const PG_KEYS = [
  'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE',
  'PGUSERNAME', 'PGAPPNAME', 'PGCONNECT_TIMEOUT', 'PGOPTIONS', 'PGSSLMODE',
] as const
type EnvSnap = Record<string, string | undefined>
function snapshotEnv(): EnvSnap { const s: EnvSnap = {}; for (const k of PG_KEYS) s[k] = process.env[k]; return s }
function restoreEnv(s: EnvSnap): void { for (const k of PG_KEYS) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]! } }
function clearEnv(): void { for (const k of PG_KEYS) delete process.env[k] }
/** Run `body` with a fully clean PG* env, then restore. */
function withCleanEnv<T>(body: () => T): T { const s = snapshotEnv(); try { clearEnv(); return body() } finally { restoreEnv(s) } }
/** Run `body` with the given PG* overrides applied on top of a clean env. */
function withEnv<T>(over: EnvSnap, body: () => T): T {
  const s = snapshotEnv()
  try { clearEnv(); for (const k of Object.keys(over)) { const v = over[k]; if (v !== undefined) process.env[k] = v }; return body() }
  finally { restoreEnv(s) }
}

describe('config defaults & precedence (object config)', () => {
  test('new Connection({}) with a clean env yields the documented defaults', () => {
    withCleanEnv(() => {
      const c = new Connection({})
      expect(c.cfg.host).toBe('localhost')
      expect(c.cfg.port).toBe(5432)
      expect(c.cfg.applicationName).toBe('minipg')
      expect(c.cfg.connectTimeout).toBe(30000)
    })
  })

  test('password is non-enumerable on cfg and defaults to empty string when unset', () => {
    withCleanEnv(() => {
      const c = new Connection({})
      expect(Object.keys(c.cfg)).not.toContain('password') // hidden from console.log/JSON
      expect(JSON.stringify(c.cfg)).not.toContain('password')
      expect(c.cfg.password).toBe('') // still directly readable; '' not undefined
    })
  })

  test('explicit host wins over PGHOST', () => {
    withEnv({ PGHOST: 'env-host.example' }, () => {
      expect(new Connection({ host: 'explicit-host' }).cfg.host).toBe('explicit-host')
    })
  })

  test('explicit port/user/database/password each override their PG* env counterpart', () => {
    withEnv({ PGPORT: '6000', PGUSER: 'envuser', PGDATABASE: 'envdb', PGPASSWORD: 'envpw' }, () => {
      const c = new Connection({ port: 7000, user: 'cfguser', database: 'cfgdb', password: 'cfgpw' })
      expect(c.cfg.port).toBe(7000)
      expect(c.cfg.user).toBe('cfguser')
      expect(c.cfg.database).toBe('cfgdb')
      expect(c.cfg.password).toBe('cfgpw')
    })
  })

  test('database defaults to the resolved user when neither config.database nor PGDATABASE is set', () => {
    withEnv({ PGUSER: 'rolex' }, () => {
      const c = new Connection({})
      expect(c.cfg.user).toBe('rolex')
      expect(c.cfg.database).toBe('rolex') // matches libpq/psql: db defaults to user
    })
  })

  test('a wrong option key (username instead of user) is silently ignored — falls through to PGUSER, never a silent wrong-role', () => {
    withEnv({ PGUSER: 'realuser' }, () => {
      // `username` is not part of ConnectConfig; cast through unknown to feed the footgun.
      const c = new Connection({ username: 'bogus' } as unknown as Record<string, never>)
      expect(c.cfg.user).toBe('realuser') // NOT 'bogus'
    })
  })

  test('connect() does not mutate the user-supplied config object', async () => {
    const input: Record<string, unknown> = { ...TEST_CONFIG }
    const before = structuredClone(input)
    const c = new Connection(input as typeof TEST_CONFIG)
    try { await c.connect() } finally { await c.end() }
    expect(input).toEqual(before)
  })

  test('connect() is idempotent — two calls return the same promise / one socket', async () => {
    const c = new Connection(TEST_CONFIG)
    try {
      const p1 = c.connect()
      const p2 = c.connect()
      expect(p1).toBe(p2)
      await p1
      expect(c.state).toBe('ready')
    } finally { await c.end() }
  })
})

describe('port / host coercion footguns', () => {
  test("port:'5433' (string) is passed through as-is (|| returns the truthy string; NOT coerced to a number)", () => {
    // note: config.port is only Number()-coerced when it comes from PGPORT; an explicit
    // string config.port short-circuits `config.port || Number(PGPORT) || 5432` unchanged.
    withCleanEnv(() => { expect(new Connection({ port: '5433' as unknown as number }).cfg.port).toBe('5433' as unknown as number) })
  })

  test('port:0 is falsy and falls through to the default 5432 (0 is not honored)', () => {
    withCleanEnv(() => { expect(new Connection({ port: 0 }).cfg.port).toBe(5432) })
  })

  test('non-numeric PGPORT → NaN (falsy) → 5432, never NaN passed to net.connect', () => {
    withEnv({ PGPORT: 'not-a-number' }, () => {
      const c = new Connection({})
      expect(Number.isNaN(c.cfg.port)).toBe(false)
      expect(c.cfg.port).toBe(5432)
    })
  })

  test("empty-string PGPORT='' → falsy → 5432 (no NaN)", () => {
    withEnv({ PGPORT: '' }, () => { expect(new Connection({}).cfg.port).toBe(5432) })
  })

  test('undefined host with no PGHOST defaults to localhost (no misleading SSL error)', () => {
    withCleanEnv(() => { expect(new Connection({ host: undefined }).cfg.host).toBe('localhost') })
  })
})

describe('environment-variable resolution (PG*)', () => {
  test('PGUSER is used when config.user is unset', () => {
    withEnv({ PGUSER: 'pgenvuser' }, () => { expect(new Connection({}).cfg.user).toBe('pgenvuser') })
  })

  test('PGDATABASE is used when config.database is unset', () => {
    withEnv({ PGUSER: 'u1', PGDATABASE: 'pgenvdb' }, () => { expect(new Connection({}).cfg.database).toBe('pgenvdb') })
  })

  test('PGPASSWORD is used when config.password is unset; explicit empty string wins over PGPASSWORD (?? only falls back on null/undefined)', () => {
    withEnv({ PGPASSWORD: 'frompgenv' }, () => {
      expect(new Connection({}).cfg.password).toBe('frompgenv')
      expect(new Connection({ password: '' }).cfg.password).toBe('') // empty string honored
    })
  })

  test('PG* env set AFTER import but BEFORE construct is honored (read in constructor, not snapshotted)', () => {
    withEnv({ PGHOST: 'late-host.example', PGPORT: '5599' }, () => {
      const c = new Connection({})
      expect(c.cfg.host).toBe('late-host.example')
      expect(c.cfg.port).toBe(5599)
    })
  })

  test('GUARD: minipg reads PGUSER only, not PGUSERNAME', () => {
    withEnv({ PGUSERNAME: 'libpq-does-not-define-this' }, () => {
      const c = new Connection({})
      expect(c.cfg.user).not.toBe('libpq-does-not-define-this')
    })
  })

  test('PGHOST/PGPORT/PGUSER/etc. from env drive a real connect — SELECT 1 returns rows', async () => {
    const c = await withEnv(
      { PGHOST: String(TEST_CONFIG.host), PGPORT: String(TEST_CONFIG.port), PGUSER: String(TEST_CONFIG.user), PGPASSWORD: String(TEST_CONFIG.password), PGDATABASE: String(TEST_CONFIG.database) },
      () => connect({}), // no fields in config — everything resolved from env at construct time
    )
    try {
      const r = await c.query('select 1 as one')
      expect((r.rows[0] as unknown[])[0]).toBe(1)
    } finally { await c.end() }
  })
})

describe('default-user fallback', () => {
  test('with config.user and PGUSER both unset, cfg.user is the OS username (non-empty) and drives the db default', () => {
    withCleanEnv(() => {
      const c = new Connection({})
      const osUser = (() => { try { return os.userInfo().username } catch { return process.env.USER || process.env.USERNAME || 'postgres' } })()
      expect(typeof c.cfg.user).toBe('string')
      expect(c.cfg.user.length).toBeGreaterThan(0)
      expect(c.cfg.user).toBe(osUser)
      expect(c.cfg.database).toBe(c.cfg.user) // resolved user also drives the database default
    })
  })

  // os.userInfo() throwing is hard to stub reliably without leaking module mocks; the
  // USER → USERNAME → 'postgres' fallback chain (src/connection.ts:40-42) is covered by reading.
  test.todo('when os.userInfo() throws, fallback chain is USER → USERNAME → postgres, never undefined', () => {})
})

describe('startup packet & startup parameters', () => {
  test('startup is well-formed: a parameterized INSERT into a connection-scoped TEMP table works', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table cc_startup(id int, label text)')
      const ins = await c.query('insert into cc_startup(id, label) values ($1, $2)', [1, 'hello'])
      expect(ins.command).toBe('INSERT')
      const r = await c.query('select label from cc_startup where id = $1', [1])
      expect((r.rows[0] as unknown[])[0]).toBe('hello')
    } finally { await c.end() }
  })

  test('user and database are sent as separate startup params (right role on the right db)', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select current_user, current_database()')
      const row = r.rows[0] as unknown[]
      expect(row[0]).toBe(String(TEST_CONFIG.user))
      expect(row[1]).toBe(String(TEST_CONFIG.database))
    } finally { await c.end() }
  })

  test('a configured applicationName appears in pg_stat_activity for this backend', async () => {
    const appName = 'cc-test-' + Math.random().toString(36).slice(2, 8)
    const c = await testConnect({ applicationName: appName })
    try {
      const pid = c.backendKey?.pid
      expect(typeof pid).toBe('number')
      const r = await c.query('select application_name from pg_stat_activity where pid = $1', [pid])
      expect((r.rows[0] as unknown[])[0]).toBe(appName)
    } finally { await c.end() }
  })

  test('with no applicationName, the default "minipg" is sent and visible in pg_stat_activity', async () => {
    const c = await testConnect({ applicationName: undefined })
    try {
      const r = await c.query('select application_name from pg_stat_activity where pid = $1', [c.backendKey?.pid])
      expect((r.rows[0] as unknown[])[0]).toBe('minipg')
    } finally { await c.end() }
  })

  test('client_encoding is sent as UTF8 (SHOW client_encoding returns UTF8)', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('show client_encoding')
      expect((r.rows[0] as unknown[])[0]).toBe('UTF8')
    } finally { await c.end() }
  })

  test('serverParams.server_version is populated from ParameterStatus (no SELECT version() needed)', async () => {
    const c = await testConnect()
    try {
      expect(typeof c.serverParams.server_version).toBe('string')
      expect(c.serverParams.server_version).toMatch(/^\d+/) // semver-ish prefix, don't pin exact
    } finally { await c.end() }
  })

  test('backendKey.pid/.secret are populated from BackendKeyData without an extra query', async () => {
    const c = await testConnect()
    try {
      expect(c.backendKey).not.toBeNull()
      expect(typeof c.backendKey!.pid).toBe('number')
      expect(typeof c.backendKey!.secret).toBe('number')
    } finally { await c.end() }
  })

  test('serverParams accumulates other startup ParameterStatus keys (e.g. server_encoding/DateStyle)', async () => {
    const c = await testConnect()
    try {
      const keys = Object.keys(c.serverParams)
      expect(keys.length).toBeGreaterThan(1)
      // these are stable across PG14–17 (values are server-config-dependent — don't pin)
      expect(keys).toContain('server_encoding')
      expect(keys).toContain('client_encoding')
    } finally { await c.end() }
  })
})

describe('connect lifecycle: settles, never hangs', () => {
  test('connect() resolves on success and is awaitable', async () => {
    const c = await testConnect()
    try { expect(c.state).toBe('ready') } finally { await c.end() }
  })

  test('a refused endpoint (127.0.0.1:1) rejects with ECONNREFUSED and leaves state "closed"', async () => {
    const c = new Connection({ ...TEST_CONFIG, host: '127.0.0.1', port: 1 })
    const err = await caught(() => c.connect())
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/ECONNREFUSED/)
    expect(c.state).toBe('closed')
  })

  test('after a connect rejection, a subsequent query() rejects with "connection is closed"', async () => {
    const c = new Connection({ ...TEST_CONFIG, host: '127.0.0.1', port: 1 })
    await caught(() => c.connect())
    const qerr = await caught(() => c.query('select 1'))
    expect((qerr as Error).message).toMatch(/connection is closed/)
  })

  test('a non-existent database rejects with PgError SQLSTATE 3D000', async () => {
    const err = await caught(() => testConnect({ database: 'cc_nope_' + Math.random().toString(36).slice(2, 8) }))
    expect(err).toBeInstanceOf(PgError)
    expect((err as PgError).code).toBe('3D000')
  })

  test('a bad password rejects with PgError SQLSTATE 28P01/28000 during auth (no hang)', async () => {
    const err = await caught(() => testConnect({ user: 'md5user', password: 'definitely-wrong', database: 'testdb' }))
    expect(err).toBeInstanceOf(PgError)
    expect(['28P01', '28000']).toContain(String((err as PgError).code))
  })

  test('connectTimeout to an unroutable host rejects with a timeout error, not a hang', async () => {
    const c = new Connection({ ...TEST_CONFIG, host: '10.255.255.1', port: 54329, connectTimeout: 300 })
    const err = await caught(() => c.connect())
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/timeout/i)
    expect(c.state).toBe('closed')
  }, 5000)

  test('an unresolvable host rejects with a catchable ENOTFOUND-bearing error', async () => {
    const c = new Connection({ ...TEST_CONFIG, host: 'cc.nonexistent.invalid.', port: 54329, connectTimeout: 4000 })
    const err = await caught(() => c.connect())
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/ENOTFOUND|EAI_AGAIN|getaddrinfo/)
    expect(c.state).toBe('closed')
  }, 8000)
})

describe('connect chaos: non-Postgres peer & mid-handshake close', () => {
  const servers: net.Server[] = []
  afterAll(() => { for (const s of servers) try { s.close() } catch { /* */ } })

  function listen(onConn: (sock: net.Socket) => void): Promise<number> {
    return new Promise((resolve) => {
      const srv = net.createServer(onConn)
      servers.push(srv)
      srv.listen(0, '127.0.0.1', () => { resolve((srv.address() as net.AddressInfo).port) })
    })
  }

  test('a socket closed by the peer mid-handshake rejects connect (no silent hang)', async () => {
    const port = await listen((sock) => { sock.destroy() }) // drop immediately, before any auth/ReadyForQuery
    const c = new Connection({ ...TEST_CONFIG, host: '127.0.0.1', port, connectTimeout: 3000 })
    const err = await caught(() => c.connect())
    expect(err).toBeInstanceOf(Error)
    expect(c.state).toBe('closed')
  }, 6000)

  test('a non-Postgres peer (garbage/HTTP bytes) fails fast, not an infinite loop', async () => {
    const port = await listen((sock) => {
      sock.on('data', () => { try { sock.write(Buffer.from('HTTP/1.1 400 Bad Request\r\n\r\n')); sock.end() } catch { /* */ } })
    })
    const c = new Connection({ ...TEST_CONFIG, host: '127.0.0.1', port, connectTimeout: 3000 })
    const err = await caught(() => c.connect())
    expect(err).toBeInstanceOf(Error)
    expect(c.state).toBe('closed')
  }, 6000)
})

describe('roadmap: not implemented in minipg (object-only config)', () => {
  test('GUARD: a connection-string is not silently char-indexed into a config object', () => {
    withCleanEnv(() => {
      // No URL parser exists. A string is not a valid ConnectConfig; the host must
      // still default to localhost rather than being picked apart character-by-character.
      const c = new Connection('postgres://u:p@h:5433/db' as unknown as Record<string, never>)
      expect(c.cfg.host).toBe('localhost')
      expect(c.cfg.port).toBe(5432)
    })
  })

  test.todo('parse a postgres:// URL string / {connectionString} into host/port/user/password/database', () => {})
  test.todo('percent-decode special chars in a URL password (p%40ss%23 → p@ss#, %2F → /)', () => {})
  test.todo('URL with no pathname defaults database to the username', () => {})
  test.todo('honor PGCONNECT_TIMEOUT / PGAPPNAME / PGOPTIONS / PGSSLMODE env vars', () => {})
  test.todo('forward an options/search_path/TimeZone/DateStyle connect-time startup param', () => {})
  test.todo('reject a non-string/object startup value with a clear validation error', () => {})
  test.todo('connect over a unix domain socket when host is a socket directory path', () => {})
  test.todo('no .s.PGSQL.<port> double-append on a unix socket path', () => {})
  test.todo('resolve service= / pg_service.conf (out of scope)', () => {})
  test.todo('multi-host / target_session_attrs / DNS round-robin failover (roadmap)', () => {})
  test.todo('inject a custom Duplex stream / pre-connected socket (roadmap)', () => {})
})

// { trace } — run the query through an async wrapper so a rejection carries the awaiting caller's frames
// (the raw reject comes from onData with no caller in its stack). See stack-explore.ts for the mechanism.
describe('{ trace }: async wrapper surfaces the caller in the error stack', () => {
  async function appQuery(c: Awaited<ReturnType<typeof connect>>) {
    return await c.query('select bad syntax here', [], { trace: true }) // caller AWAITS -> gets linked
  }
  async function appQueryNoTrace(c: Awaited<ReturnType<typeof connect>>) {
    return await c.query('select bad syntax here')
  }

  test('trace: true -> awaiting caller in the stack; PgError + code preserved; internal cause kept', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => appQuery(c))
      expect(err).toBeInstanceOf(PgError) // prototype preserved through the retrace copy
      expect((err as PgError).code).toBe('42601')
      expect((err as Error).stack).toContain('appQuery') // the caller is recovered
      expect((err as Error).stack).toContain('--- driver internals ---') // where it raised, as a tail
    } finally { await c.end() }
  })

  test('trace: false (default) -> internal stack only, caller absent', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => appQueryNoTrace(c))
      expect((err as PgError).code).toBe('42601')
      expect((err as Error).stack).not.toContain('appQueryNoTrace')
    } finally { await c.end() }
  })

  test('trace: true on a successful query is transparent (returns rows, no wrapping visible)', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select 1 as n', [], { mode: 'object', trace: true })
      expect((r.rows[0] as { n: number }).n).toBe(1)
    } finally { await c.end() }
  })
})

describe('startup parameters: options + per-session timeouts (R4)', () => {
  const show = async (c: Connection, guc: string) => ((await c.query(`show ${guc}`, [], { mode: 'object' })).rows[0] as Record<string, string>)[guc]

  test('options / statementTimeout / idleInTransactionSessionTimeout reach the startup packet; RESET ALL restores them', async () => {
    const c = await connect({ ...TEST_CONFIG, options: '-c search_path=r4test', statementTimeout: 4500, idleInTransactionSessionTimeout: 6000 })
    try {
      expect(await show(c, 'search_path')).toBe('r4test')
      expect(await show(c, 'statement_timeout')).toBe('4500ms')
      expect(await show(c, 'idle_in_transaction_session_timeout')).toBe('6s')
      // the fail-safe property: RESET ALL returns to STARTUP-PACKET values, not server defaults
      await c.query('set statement_timeout = 0')
      await c.query('reset all')
      expect(await show(c, 'statement_timeout')).toBe('4500ms')
      expect(await show(c, 'search_path')).toBe('r4test')
    } finally { c.end() }
  })

  test('?options= in a connection string round-trips (percent-encoded)', async () => {
    const { host, port, user, password, database } = TEST_CONFIG as { host: string; port: number; user: string; password: string; database: string }
    const url = `postgres://${user}:${password}@${host}:${port}/${database}?options=${encodeURIComponent('-c search_path=r4url')}`
    const c = await connect(url)
    try { expect(await show(c, 'search_path')).toBe('r4url') } finally { c.end() }
  })

  test('a NUL byte in a startup parameter throws before any bytes reach the wire', async () => {
    const err = await caught(() => connect({ ...TEST_CONFIG, options: '-c search_path=a\0b' }))
    expect((err as Error).message).toMatch(/startup parameter options contains NUL/)
  })
})

describe('channel_binding (SCRAM without channel binding)', () => {
  const base = () => {
    const { host, port, user, password, database } = TEST_CONFIG as { host: string; port: number; user: string; password: string; database: string }
    return `postgres://${user}:${password}@${host}:${port}/${database}`
  }
  test('require over PLAIN TCP throws loudly (binding needs TLS); prefer/disable connect as today', async () => {
    const err = await caught(() => connect(`${base()}?channel_binding=require`))
    expect((err as Error).message).toMatch(/channel_binding=require needs TLS/)
    expect((err as Error).message).toContain('Enable `ssl`') // names the field to set…
    expect((err as Error).message).toContain('`channel_binding=prefer`') // …and the stance to fall back to
    const c = await connect(`${base()}?channel_binding=prefer`)
    try { expect((await c.query('select 1 as ok', [], { mode: 'object' })).rows[0]).toEqual({ ok: 1 }) } finally { c.end() }
  })
  test('an unknown channel_binding value fails URL parsing like libpq', async () => {
    const err = await caught(() => connect(`${base()}?channel_binding=maybe`))
    expect((err as Error).message).toMatch(/invalid channel_binding value "maybe"/)
    expect((err as Error).message).toContain('`disable` | `prefer` | `require`') // lists what IS accepted
  })
})
