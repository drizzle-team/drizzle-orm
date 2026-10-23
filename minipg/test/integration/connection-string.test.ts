// postgres:// connection strings: parseConnectionString (DB-free) + connect(url)/createPool(url) and
// the `url` config field vs real PG. Explicit fields override the URL; pooler auto-detect keys off it.
import { test, expect, describe, afterEach } from 'bun:test'
import { connect, createPool, parseConnectionString, Connection } from '../../src/index.ts'
import { relaxChannelBinding } from '../../src/url.ts'

const URL = 'postgres://postgres:postgres@127.0.0.1:54329/testdb'
let open: Array<{ end: () => Promise<unknown> }> = []
afterEach(async () => { for (const c of open) await c.end().catch(() => {}); open = [] })

describe('parseConnectionString (no connection)', () => {
  test('userinfo, host, port, database', () => {
    expect(parseConnectionString('postgres://u:p@db.example.com:6543/mydb')).toEqual({ user: 'u', password: 'p', host: 'db.example.com', port: 6543, database: 'mydb' })
  })
  test('percent-decoding + postgresql:// scheme', () => {
    const c = parseConnectionString('postgresql://us%40r:p%3Ass@h/d%20b')
    expect(c.user).toBe('us@r'); expect(c.password).toBe('p:ss'); expect(c.database).toBe('d b')
  })
  test('sslmode → ssl', () => {
    expect(parseConnectionString('postgres://h/d?sslmode=disable').ssl).toBe(false)
    expect(parseConnectionString('postgres://h/d?sslmode=require').ssl).toBe('require')
    expect(parseConnectionString('postgres://h/d?sslmode=verify-full').ssl).toBe('verify-full')
  })
  test('application_name, connect_timeout (s→ms), unix ?host, IPv6 brackets stripped', () => {
    expect(parseConnectionString('postgres://h/d?application_name=svc&connect_timeout=5')).toMatchObject({ applicationName: 'svc', connectTimeout: 5000 })
    expect(parseConnectionString('postgres:///mydb?host=/var/run/postgresql')).toMatchObject({ path: '/var/run/postgresql', database: 'mydb' })
    expect(parseConnectionString('postgres://u@[::1]:5432/d').host).toBe('::1')
  })
  test('invalid string / wrong scheme throw', () => {
    expect(() => parseConnectionString('mysql://h/d')).toThrow()
    expect(() => parseConnectionString('not a url')).toThrow()
  })
})

describe('relaxChannelBinding (no connection): a transport that owns its TLS cannot honour `require`', () => {
  // SCRAM channel binding hashes the SERVER CERTIFICATE, which only the node TLS transport hands back.
  // On minipg/neon-ws, /cf and /deno no caller can satisfy `require` — and Neon prints
  // `?sslmode=require&channel_binding=require` on every connection string it issues, so rejecting it
  // rejected the provider's own default URL. Those entries relax it to 'prefer' before Connection sees it.
  test("`require` from the URL becomes an EXPLICIT 'prefer' (explicit wins over the url in resolveUrl)", () => {
    const out = relaxChannelBinding({ url: 'postgres://u:p@ep-x.neon.tech/db?sslmode=require&channel_binding=require' })
    expect(out.channelBinding).toBe('prefer')
    expect(out.url).toBeTruthy() // the url is left intact — only the resolved stance is overridden
    expect(parseConnectionString(out.url!).channelBinding).toBe('require') // …and resolveUrl still layers under it
  })

  test('`require` set as a config FIELD is relaxed the same way', () => {
    expect(relaxChannelBinding({ channelBinding: 'require' as const }).channelBinding).toBe('prefer')
  })

  test("'disable' and 'prefer' pass through untouched — this only ever downgrades `require`", () => {
    expect(relaxChannelBinding({ channelBinding: 'disable' as const }).channelBinding).toBe('disable')
    expect(relaxChannelBinding({ url: 'postgres://u:p@h/db?channel_binding=disable' }).channelBinding).toBeUndefined()
    expect(relaxChannelBinding({ channelBinding: 'prefer' as const }).channelBinding).toBe('prefer')
  })

  test('a config with no channel_binding anywhere is returned as-is', () => {
    const cfg = { url: 'postgres://u:p@h/db?sslmode=require' }
    expect(relaxChannelBinding(cfg)).toBe(cfg) // same object: nothing to do
    expect(relaxChannelBinding({}).channelBinding).toBeUndefined()
  })

  test('an explicit field still beats the url, in both directions', () => {
    const url = 'postgres://u:p@h/db?channel_binding=require'
    expect(relaxChannelBinding({ url, channelBinding: 'disable' as const }).channelBinding).toBe('disable')
    expect(relaxChannelBinding({ url, channelBinding: 'require' as const }).channelBinding).toBe('prefer')
  })
})

describe('invalid connection strings → helpful, password-safe errors', () => {
  const msg = (u: string) => { try { parseConnectionString(u); return '' } catch (e) { return (e as Error).message } }

  test('missing scheme → tells you to use postgres://', () => {
    expect(msg('not a url')).toMatch(/must start with "postgres:\/\/"/)
    expect(msg('user:pass@host/db')).toMatch(/postgres:\/\//)
  })
  test('wrong scheme → names the expected schemes', () => {
    expect(msg('mysql://h/d')).toMatch(/postgres:\/\/.*postgresql:\/\//)
    expect(msg('http://h/d')).toMatch(/must start with/)
  })
  test('unparseable (bad port) → suggests checking host/port + encoding credentials', () => {
    expect(msg('postgres://u:secret@host:99999/db')).toMatch(/percent-encode|host\/port/)
  })
  test('bare "%" in password → says to write it as %25', () => {
    expect(msg('postgres://u:pa%ss@h/d')).toMatch(/%25|invalid percent-escape/)
  })
  test('the password is NEVER echoed back in the error (redacted to ***)', () => {
    const m1 = msg('postgres://admin:sup3rSecret@host:99999/db')
    expect(m1).not.toContain('sup3rSecret')
    expect(m1).toContain('***')
    const m2 = msg('postgres://admin:pa%ss@h/d') // decode-failure path
    expect(m2).not.toContain('pa%ss')
    expect(m2).toContain('***')
  })
  test('the error surfaces through connect() and createPool()', async () => {
    await expect(connect('mysql://h/d')).rejects.toThrow(/postgres:\/\//)
    expect(() => { createPool('not a url') }).toThrow(/must start with/)
    await expect(connect({ url: 'postgres://u:secret@h:99999/d' })).rejects.toThrow(/host\/port|percent-encode/)
  })
})

describe('url in config: merge + pooler auto-detect (no connection)', () => {
  test('explicit fields override the URL', () => {
    const c = new Connection({ url: 'postgres://u:p@neon-pooler.example:5432/d', host: '127.0.0.1', database: 'other' })
    expect(c.cfg.host).toBe('127.0.0.1'); expect(c.cfg.database).toBe('other'); expect(c.cfg.user).toBe('u')
  })
  test('a Supabase 6543 URL turns prepare off automatically', () => {
    expect(new Connection({ url: 'postgres://u:p@aws-0-x.pooler.supabase.com:6543/postgres' }).cfg.prepare).toBe(false)
    expect(new Connection({ url: 'postgres://u:p@127.0.0.1:5432/d' }).cfg.prepare).toBe(true)
  })
})

describe('connect / createPool accept a URL vs real PG', () => {
  test('connect(url string)', async () => {
    const db = await connect(URL); open.push(db)
    const r = await db.query('select 1 as n', [], { mode: 'object' })
    expect(r.rows[0]).toEqual({ n: 1 })
  })
  test('connect({ url })', async () => {
    const db = await connect({ url: URL }); open.push(db)
    const r = await db.query('select 2 as n', [], { mode: 'object' })
    expect(r.rows[0]).toEqual({ n: 2 })
  })
  test('createPool(url string)', async () => {
    const pool = createPool(URL); open.push(pool)
    const r = await pool.query('select 3 as n', [], { mode: 'object' })
    expect(r.rows[0] as unknown).toEqual({ n: 3 })
  })
  test('createPool({ url, max }) — url + pool options together', async () => {
    const pool = createPool({ url: URL, max: 2 }); open.push(pool)
    expect(pool.options.idleTimeoutMillis).toBe(0)
    const r = await pool.query('select 4 as n', [], { mode: 'object' })
    expect(r.rows[0] as unknown).toEqual({ n: 4 })
  })
})
