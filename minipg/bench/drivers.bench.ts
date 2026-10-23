// End-to-end driver comparison: minipg vs node-postgres (pg) vs postgres.js vs Bun.sql,
// against the local test cluster over its UNIX-domain socket (bun run test:setup first; the
// setup script listens on /tmp/minipg_sock with --auth-local=trust, so no password here).
// mitata, do_not_optimize, inner_gc. All inputs (SQL, params, option objects) are built once
// at module scope — the timed fn only issues the query.
//
// A unix socket cuts transport latency vs TCP, so for multi-row results decode is a larger
// share of the time than over loopback TCP (the 'transport' group below quantifies it). For
// a fully decode-isolated view see bench/decode-vs.bench.ts.
//   bun bench/drivers.bench.ts   (or: bun run bench)
import { run, bench, group, summary, do_not_optimize } from 'mitata'
import { Client } from 'pg'
import postgres from 'postgres'
import { SQL } from 'bun'
import { connect } from '../src/index.ts'

const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'   // socket file (minipg / Bun.sql want the path)
const SOCKDIR = '/tmp/minipg_sock'               // socket dir   (pg / postgres.js want the dir)
const PORT = 54329
const TCP = { host: '127.0.0.1', port: PORT, user: 'postgres', password: 'postgres', database: 'testdb' }

// connections over the unix socket (trust auth → no password)
const mc = await connect({ path: SOCK, user: 'postgres', database: 'testdb' })
const pgc = new Client({ host: SOCKDIR, port: PORT, user: 'postgres', database: 'testdb' }); await pgc.connect()
const pgjs = postgres({ host: SOCKDIR, port: PORT, user: 'postgres', database: 'testdb', max: 1 })
const bunsql = new SQL({ path: SOCK, username: 'postgres', database: 'testdb' })
const mcTcp = await connect(TCP) // minipg over TCP, only for the transport comparison

// pre-built inputs (no allocation in the timed fns)
const SEL1 = 'select 1'
const SEL_PARAM = 'select $1::int'
const ROWS = "select g as id, 'name_' || g as name, g * 2 as a, g * 3 as b, (g % 2 = 0) as ok from generate_series(1, 100) g"
const P = [1]
const EMPTY: never[] = []
const MODE_OBJ = { mode: 'object' as const }
const MINIPG_NAME = { name: 'bp' }
const PG_PREP = { name: 'bp', text: SEL_PARAM, values: P }
const PGJS_PREP = { prepare: true }

group('SELECT 1', () => {
  summary(() => {
    bench('minipg', async () => { do_not_optimize(await mc.query(SEL1)) }).gc('inner')
    bench('pg', async () => { do_not_optimize(await pgc.query(SEL1)) }).gc('inner')
    bench('postgres.js', async () => { do_not_optimize(await pgjs.unsafe(SEL1)) }).gc('inner')
    bench('Bun.sql', async () => { do_not_optimize(await bunsql.unsafe(SEL1)) }).gc('inner')
  })
})

group('parameterized SELECT $1', () => {
  summary(() => {
    bench('minipg', async () => { do_not_optimize(await mc.query(SEL_PARAM, P)) }).gc('inner')
    bench('pg', async () => { do_not_optimize(await pgc.query(SEL_PARAM, P)) }).gc('inner')
    bench('postgres.js', async () => { do_not_optimize(await pgjs.unsafe(SEL_PARAM, P)) }).gc('inner')
    bench('Bun.sql', async () => { do_not_optimize(await bunsql.unsafe(SEL_PARAM, P)) }).gc('inner')
  })
})

group('100-row result (3 int + 1 text + 1 bool)', () => {
  summary(() => {
    bench('minipg (array)', async () => { do_not_optimize(await mc.query(ROWS)) }).gc('inner')
    bench('minipg (object)', async () => { do_not_optimize(await mc.query(ROWS, EMPTY, MODE_OBJ)) }).gc('inner')
    bench('pg (object)', async () => { do_not_optimize(await pgc.query(ROWS)) }).gc('inner')
    bench('postgres.js (object)', async () => { do_not_optimize(await pgjs.unsafe(ROWS)) }).gc('inner')
    bench('Bun.sql (object)', async () => { do_not_optimize(await bunsql.unsafe(ROWS)) }).gc('inner')
  })
})

group('prepared reuse (named statement)', () => {
  summary(() => {
    bench('minipg', async () => { do_not_optimize(await mc.query(SEL_PARAM, P, MINIPG_NAME)) }).gc('inner')
    bench('pg', async () => { do_not_optimize(await pgc.query(PG_PREP)) }).gc('inner')
    bench('postgres.js', async () => { do_not_optimize(await pgjs.unsafe(SEL_PARAM, P, PGJS_PREP)) }).gc('inner')
    bench('Bun.sql (unprepared)', async () => { do_not_optimize(await bunsql.unsafe(SEL_PARAM, P)) }).gc('inner')
  })
})

group('transport: minipg unix vs tcp', () => {
  summary(() => {
    bench('unix · SELECT 1', async () => { do_not_optimize(await mc.query(SEL1)) }).gc('inner')
    bench('tcp · SELECT 1', async () => { do_not_optimize(await mcTcp.query(SEL1)) }).gc('inner')
    bench('unix · 100-row', async () => { do_not_optimize(await mc.query(ROWS)) }).gc('inner')
    bench('tcp · 100-row', async () => { do_not_optimize(await mcTcp.query(ROWS)) }).gc('inner')
  })
})

await run()
await mc.end(); await mcTcp.end(); await pgc.end(); await pgjs.end({ timeout: 5 }); await bunsql.end()
process.exit(0)
