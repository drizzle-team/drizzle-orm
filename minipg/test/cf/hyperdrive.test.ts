// Probe: does minipg/cf work through a Cloudflare Hyperdrive binding? Runs in real workerd; the
// `HYPERDRIVE` binding is configured (test/cf/wrangler.jsonc) with a localConnectionString pointing at
// our local cluster, so Miniflare exposes env.HYPERDRIVE.{host,port,user,password,database} that route
// to it — the same shape a production Hyperdrive binding has. Requires `bun run test:setup`.
import { it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { connect } from '../../src/cf.ts'

const hd = () => (env as Record<string, { host: string; port: number; user: string; password: string; database: string; connectionString: string }>).HYPERDRIVE
const cfg = () => { const h = hd(); return { host: h.host, port: h.port, user: h.user, password: h.password, database: h.database } }

it('binding is present with host/port/user/database', () => {
  const h = hd()
  expect(typeof h?.host).toBe('string')
  expect(typeof h?.port).toBe('number')
})

it('connect + query through Hyperdrive (default unnamed statement = pooler-safe)', async () => {
  const db = await connect(cfg())
  try {
    const r = await db.query('select 1 as n, $1::text as t', ['hi'], { mode: 'object' })
    expect(r.rows[0]).toEqual({ n: 1, t: 'hi' })
    const g = await db.query('select g from generate_series(1, 20) g')
    expect(g.rows.length).toBe(20)
  } finally { await db.end() }
})

it('NAMED prepared statement reuse through Hyperdrive (transaction-pooling probe)', async () => {
  const db = await connect(cfg())
  try {
    const a = await db.query('select 2 as n', [], { name: 'hd_prep', mode: 'object' })         // Parse+Bind+Execute
    expect(a.rows[0]).toEqual({ n: 2 })
    const b = await db.query('select 2 as n', [], { name: 'hd_prep', mode: 'object' })          // reuse: Bind+Execute only
    expect(b.rows[0]).toEqual({ n: 2 }) // if this throws '26000 prepared statement does not exist' -> pooling needs prepare:false
  } finally { await db.end() }
})
