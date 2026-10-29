// @drizzle-team/postgres/deno under REAL Deno — `bun run test:deno` (needs the local cluster from `bun run test:setup`).
// Kept out of `bun test test/**` because only Deno can run it, the same way test/cf needs workerd.
//
// What this pins down, all of which was broken:
//   - denoSocket read host/port straight off the raw config, so a `{ url }` (or a connection-string
//     argument, which the signature didn't even accept) silently dialled localhost:5432;
//   - duplexFromWeb used Duplex.from({readable,writable}), a Node-only overload Deno rejects, so every
//     connect failed with "Cannot read properties of undefined (reading 'endsWith')";
//   - ssl went through Deno.connectTls, but Postgres has no implicit TLS — it needs the SSLRequest
//     dance and Deno.startTls on the same socket.
//
// Run with: deno test --allow-net --allow-env --allow-read --allow-sys test/deno/deno.test.ts
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
// Deno hands Node globals to `npm:` graphs automatically, but this suite imports the SOURCE directly —
// so install Buffer the way the npm consumer would already have it. (The driver core uses it throughout;
// only the edge entry ships src/buffer-polyfill.ts.)
import { Buffer } from 'node:buffer'
;(globalThis as { Buffer?: unknown }).Buffer ??= Buffer
import { connect, createPool, replication } from '../../src/deno.ts'

const HOST = Deno.env.get('PGTEST_HOST') ?? '127.0.0.1'
const PORT = Number(Deno.env.get('PGTEST_PORT') ?? 54329)
const URL_ = `postgres://postgres:postgres@${HOST}:${PORT}/testdb`

Deno.test('connect(url string) dials the host from the STRING, not localhost:5432', async () => {
  const db = await connect(URL_)
  try {
    const r = await db.query('select current_database() as db', [], { mode: 'object' })
    assertEquals((r.rows[0] as { db: string }).db, 'testdb')
  } finally { await db.end() }
})

Deno.test('connect({ url }) resolves host/port/user/database out of the connection string', async () => {
  const db = await connect({ url: URL_ })
  try {
    const r = await db.query('select current_user as u, current_database() as db', [], { mode: 'object' })
    assertEquals(r.rows[0], { u: 'postgres', db: 'testdb' })
  } finally { await db.end() }
})

Deno.test('explicit config fields still override the url', async () => {
  // an unreachable host in the url, overridden by explicit fields -> must connect
  const db = await connect({ url: `postgres://postgres:postgres@nope.invalid:1/testdb`, host: HOST, port: PORT })
  try { assertEquals(((await db.query('select 1 as ok', [], { mode: 'object' })).rows[0] as { ok: number }).ok, 1) }
  finally { await db.end() }
})

Deno.test('url query parameters reach the startup packet (application_name)', async () => {
  const db = await connect(`${URL_}?application_name=postgres_deno_test`)
  try {
    const r = await db.query('select application_name as a from pg_stat_activity where pid = pg_backend_pid()', [], { mode: 'object' })
    assertEquals((r.rows[0] as { a: string }).a, 'postgres_deno_test')
  } finally { await db.end() }
})

Deno.test('createPool(url string) works the same way', async () => {
  const pool = createPool(URL_)
  try {
    const r = await pool.query('select count(*) as n from t', [], { mode: 'object' })
    assertEquals((r.rows[0] as { n: bigint }).n, 3n) // int8 -> BigInt, as on every entry
  } finally { await pool.end() }
})

Deno.test('the Web-stream transport decodes a full result set (bridge carries real traffic)', async () => {
  const db = await connect(URL_)
  try {
    const r = await db.query('select id, name, n8, amount, ok, data from t order by id', [], { mode: 'object' })
    assertEquals(r.rows.length, 3)
    const first = r.rows[0] as Record<string, unknown>
    assertEquals(first.name, 'alice')
    assertEquals(first.n8, 9007199254740993n) // exact past 2^53
    assertEquals(first.amount, '1234.56')     // numeric -> exact string
    assertEquals(first.data, { a: 1 })
    // a large result exercises multi-chunk reassembly + backpressure through the bridge
    const big = await db.query('select g, repeat(\'x\', 900) as pad from generate_series(1, 3000) g')
    assertEquals(big.rows.length, 3000)
  } finally { await db.end() }
})

Deno.test('a bad host in the url fails loudly instead of silently hitting localhost', async () => {
  let msg = ''
  try { const db = await connect(`postgres://postgres:postgres@${HOST}:1/testdb`); await db.end() }
  catch (e) { msg = (e as Error).message }
  assertStringIncludes(msg.toLowerCase(), 'refused')
})

// TLS. The regression being pinned is that this entry used Deno.connectTls — IMPLICIT TLS — where
// Postgres speaks plaintext until it answers 'S' to an SSLRequest. That must be caught on the standard
// fixture, so this test always runs:
//
//   - with a CA that ISSUED the server's leaf (DRIZZLE_POSTGRES_DENO_TLS_CA), it asserts the full handshake;
//   - without one it asserts the failure is a CERTIFICATE rejection, which can only happen if the
//     SSLRequest exchange already succeeded and Deno.startTls actually ran. The fixture cert from
//     test/setup-pg.sh is self-signed with CA:TRUE, which Deno's rustls refuses as an end-entity
//     (CaUsedAsEndEntity) — a rejection at that stage IS the proof. The old implicit-TLS code never
//     got that far: Postgres read the ClientHello as a startup packet and the handshake died without
//     any certificate ever being evaluated.
const TLS_CA = Deno.env.get('DRIZZLE_POSTGRES_DENO_TLS_CA')

Deno.test("sslmode=require in the url performs the SSLRequest dance, then startTls", async () => {
  const ca = TLS_CA ? await Deno.readTextFile(TLS_CA) : undefined
  const ssl = ca ? { ca, servername: 'localhost' } : { servername: 'localhost' }
  const cfg = { url: `${URL_}?sslmode=require`, ssl }

  if (ca) { // a trusted chain: the session must actually come up encrypted
    const db = await connect(cfg)
    try {
      const r = await db.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()', [], { mode: 'object' })
      assertEquals((r.rows[0] as { ssl: boolean }).ssl, true)
    } finally { await db.end() }
    return
  }

  const err = await connect(cfg).then((db) => db.end().then(() => null), (e: Error) => e)
  if (err === null) throw new Error('untrusted certificate was accepted — TLS is not failing closed')
  assertStringIncludes(err.message.toLowerCase(), 'certificate') // reached verification => STARTTLS worked
})

// Deno.startTls returns a stream, never the peer certificate — Deno.TlsConn exposes only handshake(), and
// node:tls under Deno hands back {subject, subjectaltname} with no raw DER. So SCRAM's tls-server-end-point
// cannot be computed on this transport by anyone. This entry dials ANY Postgres, so `require` is refused
// with that reason rather than quietly downgraded to an unbound session. (@drizzle-team/postgres/neon-ws relaxes it to
// 'prefer' instead: it points at one provider whose URLs always carry the parameter and whose own drivers
// ignore it — @neondatabase/serverless always picks plain SCRAM-SHA-256 with the gs2 header `n,,`.)
Deno.test('channel_binding=require is refused up front, naming the Deno limit', async () => {
  const err = await connect(`${URL_}?channel_binding=require`).then((db) => db.end().then(() => null), (e: Error) => e)
  if (err === null) throw new Error('channel_binding=require was accepted — it cannot be honoured here')
  assertStringIncludes(err.message, 'channel_binding=require cannot be honoured')
  assertStringIncludes(err.message, 'Deno.TlsConn')              // says WHY, not just "unsupported"
  assertStringIncludes(err.message, '`channel_binding=prefer`')  // …and what to do instead,
  assertStringIncludes(err.message, '`@drizzle-team/postgres/node`')             // …or where to go for a bound connection
  assertEquals((err as unknown as { fatal?: boolean }).fatal, true) // a pool must not retry this
})

Deno.test('createPool refuses it synchronously — no lazy 30s breaker timeout', () => {
  let threw = ''
  try { createPool(`${URL_}?channel_binding=require`) } catch (e) { threw = (e as Error).message }
  assertStringIncludes(threw, 'channel_binding=require cannot be honoured')
})

Deno.test('prefer and disable still connect normally', async () => {
  for (const mode of ['prefer', 'disable']) {
    const db = await connect(`${URL_}?channel_binding=${mode}`)
    try { assertEquals(((await db.query('select 1 as ok', [], { mode: 'object' })).rows[0] as { ok: number }).ok, 1) }
    finally { await db.end() }
  }
})

// Without a cancel request, the server keeps running pg_sleep(5), so the next query waits about 5 s for it.
Deno.test('a timeout cancels the query on the server, and the same backend serves the next query', async () => {
  const db = await connect(URL_)
  try {
    const pid = db.backendKey!.pid
    const t0 = Date.now()
    const err = await db.query('select pg_sleep(5)', [], { timeout: 200 }).then(() => null, (e: Error) => e)
    assertEquals((err as { code?: string } | null)?.code, 'QUERY_TIMEOUT')
    const r = await db.query('select pg_backend_pid() as pid', [], { mode: 'object' })
    if (Date.now() - t0 >= 3000) throw new Error(`the next query waited ${Date.now() - t0} ms, so the cancel did not stop the sleep`)
    assertEquals((r.rows[0] as { pid: number }).pid, pid)
  } finally { await db.end() }
})

Deno.test('replication dials through the Deno transport', async () => {
  const repl = await replication(URL_)
  try { assertEquals((await repl.identify()).dbname, 'testdb') } finally { repl.end() }
})

Deno.test('a pool fails fast when Deno rejects the self-signed certificate', async () => {
  const pool = createPool(`${URL_}?sslmode=verify-full`)
  const t0 = Date.now()
  try {
    const err = await pool.acquire().then(() => null, (e: Error) => e)
    assertStringIncludes(err?.message ?? '', 'invalid peer certificate')
  } finally { await pool.end() }
  assertEquals(Date.now() - t0 < 3000, true)
})
