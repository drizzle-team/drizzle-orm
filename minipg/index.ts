// Runnable minipg examples against the local test cluster.
// Start the cluster once with `bun run test:setup`, then: bun index.ts
import { Pool, Json } from './src/index.ts'
import type { Plugin } from './src/plugin.ts'

const sqlLog: Plugin = { name: 'sql-log', onQueryStart: i => void console.log('→', i.sql, i.prepared ? '(reuse)' : '') }
const c = new Pool({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb', plugins: [sqlLog]})

const sql = `select row_to_json(x) as row from (select array[9007199254740993, 2, 3]::int8[]) x`

const [q1, q2] = await c.parallel([
  c.query(sql,[], { mode: 'object' }),
  c.query(sql,[], { mode: 'object' })
])

console.dir(q1, { depth: 5 })
console.dir(q2, { depth: 5 })

await c.end()
