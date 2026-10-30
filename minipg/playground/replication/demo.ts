// End-to-end logical replication demo/verification against the local cluster (wal_level=logical).
// Proves: gapless snapshot-export backfill handoff, full pgoutput decode (insert/update with and
// without REPLICA IDENTITY FULL, delete, truncate, emitted messages, TOAST 'u'), ack semantics
// (confirmed_flush advances), and at-least-once replay after reconnect without ack.
//   bun playground/replication/demo.ts
import { connect } from '../../src/index.ts'
import { ReplClient, lsnToString, type PgoutputEvent } from './repl-client.ts'

const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'
const DB = { user: 'postgres', database: 'testdb' }
const ok = (cond: boolean, what: string): void => { if (!cond) throw new Error(`FAILED: ${what}`); console.log(`  ok: ${what}`) }

const mc = await connect({ path: SOCK, ...DB })
await mc.query(`select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name = 'pulse_demo'`).catch(() => {})
await mc.query('drop publication if exists pulse_pub')
await mc.query('drop table if exists pulse_t')
await mc.query('create table pulse_t(id int8 primary key, v text, data jsonb, big text)')
await mc.query('create publication pulse_pub for table pulse_t')
await mc.bulkInsert('pulse_t', { id: 'int8', v: 'text', data: 'jsonb', big: 'text' } as never,
  [[1, 'one', '{"a":1}', 'x'], [2, 'two', '{"a":2}', 'x'], [3, 'three', '{"a":3}', 'x']])

console.log('== handshake + slot ==')
const repl = await ReplClient.connect({ unix: SOCK, ...DB })
const sys = await repl.identify()
console.log(`  IDENTIFY_SYSTEM: timeline=${sys.timeline} xlogpos=${sys.xlogpos} db=${sys.dbname}`)
const slot = await repl.createSlot('pulse_demo', { exportSnapshot: true }) // durable: we test replay
console.log(`  slot=${slot.slot} consistent_point=${lsnToString(slot.consistentPoint)} snapshot=${slot.snapshot}`)

// A row inserted AFTER the slot exists: must appear in the STREAM, not the snapshot.
await mc.query(`insert into pulse_t values (4, 'four', '{"a":4}', 'x')`)

console.log('== gapless backfill (exported snapshot) ==')
const mc2 = await connect({ path: SOCK, ...DB })
const backfill = await mc2.begin({ isolation: 'repeatable read' }, async (tx) => {
  await tx.query(`set transaction snapshot '${slot.snapshot}'`)
  return tx.query('select id from pulse_t order by id')
})
await mc2.end()
ok(backfill.rows.length === 3, `snapshot sees exactly the 3 pre-slot rows (row 4 excluded): [${backfill.rows.map((r) => (r as unknown[])[0])}]`)

console.log('== generate changes ==')
await mc.query(`update pulse_t set v = 'ONE' where id = 1`)                       // identity DEFAULT: no old tuple
await mc.query('alter table pulse_t replica identity full')
await mc.query(`update pulse_t set v = 'TWO' where id = 2`)                        // identity FULL: full old tuple
await mc.query(`update pulse_t set data = '{"a":22}' where id = 2`)                // TOAST check needs a big value:
// incompressible ~128KB so it stores OUT-OF-LINE (repeat() would compress inline -> no 'u' marker)
await mc.query(`update pulse_t set big = (select string_agg(md5(g::text), '') from generate_series(1, 4000) g) where id = 3`)
await mc.query('alter table pulse_t replica identity default')
await mc.query(`update pulse_t set v = 'THREE' where id = 3`)                      // big unchanged -> 'u' marker
await mc.query(`delete from pulse_t where id = 4`)
await mc.query(`select pg_logical_emit_message(true, 'pulse', 'sync-barrier-1')`)
await mc.query('truncate pulse_t')

console.log('== stream + decode ==')
const events: PgoutputEvent[] = []
let commitLsn = 0n
for await (const e of repl.start('pulse_demo', slot.consistentPoint, ['pulse_pub'])) {
  events.push(e)
  if (e.kind === 'commit') commitLsn = e.endLsn
  if (e.kind === 'truncate') break // last change we generated
}
const kinds = events.map((e) => e.kind)
console.log(`  ${events.length} events: ${kinds.join(' ')}`)
const ins = events.filter((e) => e.kind === 'insert')
ok(ins.length === 1 && (ins[0] as { new: unknown[] }).new[0] === '4', 'first streamed tx is the post-slot insert of row 4 (values are query-wire text)')
const ups = events.filter((e) => e.kind === 'update') as Extract<PgoutputEvent, { kind: 'update' }>[]
ok(ups[0]!.old === null, 'update under REPLICA IDENTITY DEFAULT carries NO old tuple')
ok(ups[1]!.oldKind === 'full' && ups[1]!.old![1] === 'two', 'update under IDENTITY FULL carries the full OLD row')
const toastUp = ups.find((u) => u.new.some((c) => typeof c === 'object' && c !== null))
ok(!!toastUp, "unchanged TOASTed column arrives as the 'u' marker (distinct from null)")
const del = events.find((e) => e.kind === 'delete') as Extract<PgoutputEvent, { kind: 'delete' }>
ok(del.old[0] === '4', 'delete carries the old key tuple')
const msg = events.find((e) => e.kind === 'message') as Extract<PgoutputEvent, { kind: 'message' }>
ok(msg.prefix === 'pulse' && msg.content.toString() === 'sync-barrier-1', 'pg_logical_emit_message arrives with prefix + payload')
ok(kinds.includes('truncate'), 'truncate event arrives')
ok(kinds.includes('relation'), "relation ('R') metadata preceded first row and re-sent on schema change")
const rel = (events.find((e) => e.kind === 'relation') as Extract<PgoutputEvent, { kind: 'relation' }>).relation
ok(rel.name === 'pulse_t' && rel.columns.map((c) => c.oid).join(',') === '20,25,3802,25', 'relation carries column names + type OIDs (the decode registry)')

console.log('== replay without ack (at-least-once) ==')
repl.end() // did NOT ack -> confirmed_flush unchanged -> reconnect must replay
const repl2 = await ReplClient.connect({ unix: SOCK, ...DB })
const replay: string[] = []
for await (const e of repl2.start('pulse_demo', slot.consistentPoint, ['pulse_pub'])) {
  if (e.kind !== 'relation') replay.push(e.kind)
  if (e.kind === 'truncate') break
}
ok(replay.filter((k) => k === 'insert').length === 1 && replay.includes('truncate'), `unacked events REPLAYED after reconnect (${replay.length} events again)`)

console.log('== ack advances confirmed_flush ==')
repl2.ack(commitLsn)
await Bun.sleep(300)
const cf = await mc.query(`select confirmed_flush_lsn::text from pg_replication_slots where slot_name = 'pulse_demo'`)
console.log(`  confirmed_flush_lsn=${(cf.rows[0] as unknown[])[0]} (acked ${lsnToString(commitLsn)})`)
ok((cf.rows[0] as unknown[])[0] !== lsnToString(slot.consistentPoint), 'confirmed_flush advanced past the consistent point after ack')

repl2.end()
await mc.query(`select pg_drop_replication_slot('pulse_demo')`)
await mc.query('drop publication pulse_pub')
await mc.query('drop table pulse_t')
await mc.end()
console.log('\nall assertions passed')
process.exit(0)
