// Real-DB driver comparison over a UNIX DOMAIN SOCKET. Every driver runs on a pool of the SAME
// size and with PREPARED statements; each measured iteration runs ONE query (single-query latency,
// not fan-out — a pool just gives each driver identical connection headroom). Hits the local test
// cluster from `bun run test:setup` via its unix socket (/tmp/minipg_sock/.s.PGSQL.54329;
// --auth-local=trust, so no password).
//
// End-to-end (transport + server execution + decode + row build), not the old decode-isolated mock.
// The unix socket removes TCP loopback and prepared statements remove parse/plan, so each driver's
// CPU (framing + value decode + row build) is a large share of what's left — where minipg's
// interpreted/JIT decode work shows up.
//
// mitata, do_not_optimize, inner gc. Pools + statements are warmed before timing.
//   bun bench/decode-vs.bench.ts   (or: bun run bench:decode-vs)   -- needs `bun run test:setup`
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { Pool as PgPool } from 'pg'
import postgres from 'postgres'
// import { SQL } from 'bun'
import { createPool } from '../src/index.ts'                        // interpreted decode path
import { createPool as createPoolJit } from '../src/index.ts' // JIT/codegen decode path

const SOCK_DIR = '/tmp/minipg_sock'                 // PG unix_socket_directories (see test/setup-pg.sh)
const SOCK_PATH = SOCK_DIR + '/.s.PGSQL.54329'      // the socket FILE minipg connects to via `path`
const PORT = 54329, USER = 'postgres', DB = 'testdb'
const POOL = 8                                       // identical pool size for every driver

// real rows: 3 int + text + bool (exercises int-from-bniytes, string, bool decode)
const mkSql = (n: number) => `select g::int4 as id, (g*2)::int4 as a, (g*3)::int4 as b, ('name_'||g) as name, (g%2=0) as ok from generate_series(1, ${n}) g`
const SQL100 = mkSql(100), SQL1000 = mkSql(1000)

// pools (size POOL), prepared statements on. minipg 6y6connects to the socket FILE (path); pg/postgres.js
// use the libpq convention host=<socket dir> + port -> <dir>/.s.PGSQL.<port>.
const mc = createPool({ path: SOCK_PATH, user: USER, database: DB, password: '', max: POOL, decode: "interpreted" })
const mj = createPoolJit({ path: SOCK_PATH, user: USER, database: DB, password: '', max: POOL, decode: "jit" }) as unknown as typeof mc
const pgp = new PgPool({ host: SOCK_DIR, port: PORT, user: USER, database: DB, max: POOL })
const sql = postgres({ host: SOCK_DIR, port: PORT, user: USER, database: DB, max: POOL, prepare: true })
// const bunsql = new SQL({ adapter: 'postgres', path: SOCK_PATH, username: USER, database: DB, max: POOL, prepare: true }) // Bun.sql: `path` = unix socket FILE

const EMPTY: never[] = []
// Bun.sql tagged template (sql``) — prepared + cached by template identity, faster than unsafe().
// Literal queries (no interpolation) so they match exactly what the other drivers run.
// const b100 = () => bunsql`select g::int4 as id, (g*2)::int4 as a, (g*3)::int4 as b, ('name_'||g) as name, (g%2=0) as ok from generate_series(1, 100) g`
// const b1000 = () => bunsql`select g::int4 as id, (g*2)::int4 as a, (g*3)::int4 as b, ('name_'||g) as name, (g%2=0) as ok from generate_series(1, 1000) g`

// warm: prepare each statement on its driver before timing (mitata also warms each bench).
// minipg: { name } enables server-side prepared-statement caching; pg: { name }; postgres.js: { prepare }.
for (let i = 0; i < 5; i++) {
  await mc.query(SQL100, EMPTY, { name: 'm100' }); await mc.query(SQL1000, EMPTY, { name: 'm1000', mode: "object" })
  await mj.query(SQL100, EMPTY, { name: 'j100' }); await mj.query(SQL1000, EMPTY, { name: 'j1000', mode: "object" })
  await pgp.query({ text: SQL100, name: 'pg100' }); await pgp.query({ text: SQL1000, name: 'pg1000' })
  await sql.unsafe(SQL100, [], { prepare: true }); await sql.unsafe(SQL1000, [], { prepare: true })
  // await b100(); await b1000()
}

group(`100 rows · 3int+text+bool · unix socket · pool(${POOL}) · prepared · 1 query/iter`, () => {
  summary(() => {
    bench('minipg interp (array)', async () => { do_not_optimize(await mc.query(SQL100, EMPTY, { name: 'm100' })) }).gc('inner')
    bench('minipg interp (object)', async () => { do_not_optimize(await mc.query(SQL100, EMPTY, { name: 'm100', mode: 'object' })) }).gc('inner')
    bench('minipg JIT (array)', async () => { do_not_optimize(await mj.query(SQL100, EMPTY, { name: 'j100' })) }).gc('inner')
    bench('minipg JIT (object)', async () => { do_not_optimize(await mj.query(SQL100, EMPTY, { name: 'j100', mode: 'object' })) }).gc('inner')
    bench('pg (object)', async () => { do_not_optimize(await pgp.query({ text: SQL100, name: 'pg100' })) }).gc('inner')
    bench('pg (object)', async () => { do_not_optimize(await pgp.query({ text: SQL100, name: 'pg100' })) }).gc('inner')
    bench('postgres.js (object)', async () => { do_not_optimize(await sql.unsafe(SQL100, [], { prepare: true })) }).gc('inner')
    bench('postgres.js (object)', async () => { do_not_optimize(await sql.unsafe(SQL100, [], { prepare: true })) }).gc('inner')
    // bench('Bun.sql (object)', async () => { do_not_optimize(await b100()) }).gc('inner')
  })
})

group(`1000 rows · 3int+text+bool · unix socket · pool(${POOL}) · prepared · 1 query/iter`, () => {
  summary(() => {
    bench('minipg interp (array)', async () => { do_not_optimize(await mc.query(SQL1000, EMPTY, { name: 'm1000' })) }).gc('inner')
    bench('minipg interp (object)', async () => { do_not_optimize(await mc.query(SQL1000, EMPTY, { name: 'm1000', mode: 'object' })) }).gc('inner')
    bench('minipg JIT (array)', async () => { do_not_optimize(await mj.query(SQL1000, EMPTY, { name: 'j1000' })) }).gc('inner')
    bench('minipg JIT (object)', async () => { do_not_optimize(await mj.query(SQL1000, EMPTY, { name: 'j1000', mode: 'object' })) }).gc('inner')
    bench('pg (object)', async () => { do_not_optimize(await pgp.query({ text: SQL1000, name: 'pg1000'  })) }).gc('inner')
    bench('pg (object)', async () => { do_not_optimize(await pgp.query({ text: SQL1000, name: 'pg1000'  })) }).gc('inner')
    bench('postgres.js (object)', async () => { do_not_optimize(await sql.unsafe(SQL1000, [], { prepare: true })) }).gc('inner')
    bench('postgres.js (object)', async () => { do_not_optimize(await sql.unsafe(SQL1000, [], { prepare: true })) }).gc('inner')
    // bench('Bun.sql (object)', async () => { do_not_optimize(await b1000()) }).gc('inner')
  })
})

await run()
await mc.end(); await mj.end(); await pgp.end(); await sql.end({ timeout: 5 });
// await bunsql.end()
process.exit(0)
