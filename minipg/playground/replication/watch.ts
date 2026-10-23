// Long-running CDC watcher: subscribes to ALL tables in testdb via logical replication and
// pretty-prints every change as it commits. Open the printed DSN in Drizzle Studio, edit rows,
// watch the diffs stream here. Ctrl-C to stop (temporary slot drops itself).
//   bun playground/replication/watch.ts
import { connect } from '../../src/index.ts'
import { ReplClient, lsnToString, type PgoutputEvent, type RelInfo, type Tuple } from './repl-client.ts'

const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'
const DB = { user: 'postgres', database: 'testdb' }
const DSN = 'postgresql://postgres:postgres@127.0.0.1:54329/testdb'

// ---- setup: a nice table to play with + an all-tables publication ----
const mc = await connect({ path: SOCK, ...DB })
await mc.query(`create table if not exists pulse_playground(
  id bigint generated always as identity primary key,
  name text, qty int4, price float8, tags jsonb, updated_at timestamptz default now())`)
await mc.query('alter table pulse_playground replica identity full') // full old rows -> real diffs
await mc.query('create publication pulse_watch for all tables').catch(() => { /* exists */ })
await mc.query(`insert into pulse_playground (name, qty, price, tags)
  select 'sample_' || g, g, g + 0.5, jsonb_build_object('n', g) from generate_series(1, 3) g
  on conflict do nothing`).catch(() => { /* replay-safe */ })
await mc.end()

const repl = await ReplClient.connect({ unix: SOCK, ...DB })
const slot = await repl.createSlot(`pulse_watch_${process.pid}`, { temporary: true })

// ---- pretty printing ----
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', b: '\x1b[34m', dim: '\x1b[2m', off: '\x1b[0m' }
const show = (v: Tuple[number]): string =>
  v === null ? `${C.dim}null${C.off}`
  : typeof v === 'object' ? `${C.dim}(toast unchanged)${C.off}`
  : v.length > 60 ? JSON.stringify(v.slice(0, 57) + '…') : JSON.stringify(v)
const rowObj = (rel: RelInfo, t: Tuple): string =>
  '{ ' + t.map((v, i) => `${rel.columns[i]?.name ?? i}: ${show(v)}`).join(', ') + ' }'
const keyOf = (rel: RelInfo, t: Tuple): string =>
  rel.columns.map((c, i) => (c.key ? `${c.name}=${show(t[i]!)}` : null)).filter(Boolean).join(' ') || rowObj(rel, t)
const hinted = new Set<string>()

let tx: PgoutputEvent[] = []
const printTx = (commit: Extract<PgoutputEvent, { kind: 'commit' }>): void => {
  const data = tx.filter((e) => e.kind !== 'relation' && e.kind !== 'begin' && e.kind !== 'origin' && e.kind !== 'type')
  if (data.length === 0) return // DDL-only tx noise on PG14
  const begin = tx.find((e) => e.kind === 'begin') as Extract<PgoutputEvent, { kind: 'begin' }> | undefined
  console.log(`${C.dim}── tx${begin ? ` xid=${begin.xid}` : ''} @ ${lsnToString(commit.endLsn)} ${commit.commitTime.toISOString()}${C.off}`)
  for (const e of data) {
    if (e.kind === 'insert') console.log(`  ${C.g}+ ${e.relation.schema}.${e.relation.name}${C.off} ${rowObj(e.relation, e.new)}`)
    else if (e.kind === 'delete') console.log(`  ${C.r}- ${e.relation.schema}.${e.relation.name}${C.off} ${e.oldKind === 'full' ? rowObj(e.relation, e.old) : keyOf(e.relation, e.old)}`)
    else if (e.kind === 'update') {
      const rel = e.relation
      if (e.old) {
        const diffs = e.new.map((nv, i) => {
          const ov = e.old![i] ?? null
          const changed = typeof nv === 'object' && nv !== null ? false : JSON.stringify(ov) !== JSON.stringify(nv)
          return changed ? `${rel.columns[i]?.name ?? i}: ${show(ov)} ${C.y}→${C.off} ${show(nv)}` : null
        }).filter(Boolean)
        console.log(`  ${C.y}~ ${rel.schema}.${rel.name}${C.off} ${keyOf(rel, e.old)}  ${diffs.join(', ') || C.dim + '(no visible change)' + C.off}`)
      } else {
        console.log(`  ${C.y}~ ${rel.schema}.${rel.name}${C.off} new: ${rowObj(rel, e.new)}`)
        const t = `${rel.schema}.${rel.name}`
        if (!hinted.has(t)) { hinted.add(t); console.log(`    ${C.dim}(old row not in stream — run: alter table ${t} replica identity full)${C.off}`) }
      }
    }
    else if (e.kind === 'truncate') console.log(`  ${C.r}✂ truncate${C.off} ${e.relations.map((r) => `${r.schema}.${r.name}`).join(', ')}`)
    else if (e.kind === 'message') console.log(`  ${C.b}✉ message${C.off} [${e.prefix}] ${e.content.toString()}`)
  }
  repl.ack(commit.endLsn) // watched = processed: advance the slot as we go
}

console.log(`${C.b}watching testdb for changes (publication: pulse_watch, slot: ${slot.slot})${C.off}`)
console.log(`open in Drizzle Studio:  ${DSN}`)
console.log(`play table:              pulse_playground (replica identity FULL — updates show old → new)`)
console.log(`stop:                    Ctrl-C\n`)

process.on('SIGINT', () => { console.log('\nbye'); repl.end(); process.exit(0) })

for await (const e of repl.start(slot.slot, slot.consistentPoint, ['pulse_watch'])) {
  if (e.kind === 'commit') { printTx(e); tx = [] }
  else tx.push(e)
}
