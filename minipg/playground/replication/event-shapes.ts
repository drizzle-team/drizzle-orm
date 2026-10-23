// Show the EXACT ReplicationEvent shapes for insert/update/delete under REPLICA IDENTITY
// DEFAULT vs FULL, including the TOAST 'unchanged' marker.   bun playground/replication/event-shapes.ts
import { connect } from '../../src/index.ts'
import { replication } from '../../src/replication.ts'
import { createHash } from 'node:crypto'

const CFG = { path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' }
const c = await connect(CFG)
await c.query('drop table if exists evdemo cascade')
await c.query('drop publication if exists evdemo_pub')
await c.query('create table evdemo(id int8 primary key, name text, payload text, qty int4)')
await c.query('create publication evdemo_pub for table evdemo')

const repl = await replication(CFG)
await repl.createSlot('evdemo_slot', { temporary: true })
const stream = repl.start({ slot: 'evdemo_slot', publications: ['evdemo_pub'] })

// incompressible ~600KB so it TOASTs out-of-line (repeat() would compress inline)
let chunk = 'seed'; const parts: string[] = []
for (let i = 0; i < 20000; i++) { chunk = createHash('md5').update(chunk).digest('hex'); parts.push(chunk) }
const big = parts.join('')

const actions = (async () => {
  await c.query(`insert into evdemo values (1, 'alex', 'small', 10)`)
  await c.query(`update evdemo set name = 'alexander' where id = 1`)           // identity DEFAULT, no TOAST yet
  await c.query(`update evdemo set payload = $1 where id = 1`, [big])          // payload becomes TOASTed
  await c.query(`update evdemo set qty = 11 where id = 1`)                     // TOASTed payload NOT touched -> 'u'
  await c.query(`delete from evdemo where id = 1`)
  await c.query(`alter table evdemo replica identity full`)
  await c.query(`insert into evdemo values (2, 'mira', 'small', 20)`)
  await c.query(`update evdemo set qty = 21 where id = 2`)                     // identity FULL -> old = whole row
  await c.query(`delete from evdemo where id = 2`)
})()

let commits = 0
for await (const e of stream) {
  if (e.kind === 'begin') continue
  if (e.kind === 'commit') { repl.ack(e.endLsn); if (++commits === 9) break; continue }
  if (e.kind === 'update' || e.kind === 'insert') { // truncate huge payloads for printing
    for (const r of [(e as { new?: Record<string, unknown> }).new, (e as { old?: Record<string, unknown> | null }).old]) {
      if (r && typeof r.payload === 'string' && r.payload.length > 40) r.payload = `<${r.payload.length} chars>`
    }
  }
  if (e.kind === 'delete' && typeof (e.old as Record<string, unknown>).payload === 'string' && ((e.old as Record<string, unknown>).payload as string).length > 40) (e.old as Record<string, unknown>).payload = `<big>`
  console.dir(e, { depth: 4 })
}
await actions
await repl.end()
await c.query('drop publication evdemo_pub')
await c.query('drop table evdemo')
await c.end()
process.exit(0)
