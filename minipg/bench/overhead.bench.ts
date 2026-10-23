// Pure driver-overhead bench: minipg over an IN-PROCESS transport wired to the mock
// (no TCP, no real Postgres). The numbers are the driver's own CPU cost — serialize +
// frame/parse + decode + promise plumbing — with network and query execution removed,
// so optimization deltas are visible without loopback-RTT noise.
//   bun bench/overhead.bench.ts
import { run, bench, group, do_not_optimize } from 'mitata'
import { connect } from '../src/index.ts'
import { MockPgServer } from '../test/mock/server.ts'

const rows100 = Array.from({ length: 100 }, (_, i) => [String(i + 1), `name_${i + 1}`, String((i + 1) * 2)] as (string | null)[])
const mock = await MockPgServer.start({
  onQuery: (sql) => (sql.includes('generate_series')
    ? { fields: [{ name: 'id', oid: 23 }, { name: 'name', oid: 25 }, { name: 'v', oid: 23 }], rows: rows100, command: 'SELECT' }
    : { fields: [{ name: 'n', oid: 23 }], rows: [['1']], command: 'SELECT' }),
})
mock.cacheResponses(true) // pre-serialize responses so we measure driver CPU, not mock serialization

const c = await connect({ host: 'in-process', port: 0, user: 'u', database: 'd', socket: () => mock.inProcessConnect() })
let n = 0
const ROWS = 'select * from generate_series(1,100)'

group('minipg driver overhead (in-process, no network)', () => {
  bench('SELECT 1', async () => { do_not_optimize(await c.query('select 1')) })
  bench('param $1', async () => { do_not_optimize(await c.query('select $1::int', [n++])) })
  bench('100-row · array', async () => { do_not_optimize(await c.query(ROWS)) })
  bench('100-row · object', async () => { do_not_optimize(await c.query(ROWS, [], { mode: 'object' })) })
  bench('100-row · buffer', async () => { do_not_optimize(await c.query(ROWS, [], { mode: 'buffer' })) })
  bench('100-row · raw', async () => { do_not_optimize(await c.query(ROWS, [], { mode: 'raw' })) })
  bench('prepared $1', async () => { do_not_optimize(await c.query('select $1::int', [n++], { name: 'p' })) })
})

await run()
await c.end()
await mock.close()
process.exit(0)
