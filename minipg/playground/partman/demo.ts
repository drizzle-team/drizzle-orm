// pg_partman lifecycle demo: create_parent -> auto partitions -> routing -> pruning ->
// run_maintenance (new + retention-detach) -> cold-tier handoff of detached partitions.
//   bun playground/partman/demo.ts   (needs: create extension pg_partman in testdb)
import { connect } from '../../src/index.ts'

const c = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' })
const q = async (sql: string): Promise<unknown[]> => (await c.query(sql, [], { mode: 'object' })).rows
await c.query(`drop table if exists public.events cascade`)
await c.query(`delete from partman.part_config where parent_table = 'public.events'`)

// 1. a declaratively partitioned parent — partman requires you create it partitioned
await c.query(`create table public.events (
  id bigint generated always as identity,
  kind text not null,
  payload jsonb,
  created_at timestamptz not null default now()
) partition by range (created_at)`)

// 2. hand it to partman: daily partitions, starting 6 days back, 2 premade ahead
await c.query(`select partman.create_parent(
  p_parent_table := 'public.events',
  p_control      := 'created_at',
  p_interval     := '1 day',
  p_premake      := 2,
  p_start_partition := (now() - interval '6 days')::text
)`)
console.log('partitions after create_parent:')
console.log(await q(`select relid::text as partition, pg_get_expr(c.relpartbound, c.oid) as bounds
  from pg_partition_tree('public.events') t join pg_class c on c.oid = t.relid
  where isleaf order by 1`))

// 3. insert a week of data — rows route to the right partition automatically
await c.query(`insert into events(kind, payload, created_at)
  select 'click', jsonb_build_object('n', g), now() - (g % 7) * interval '1 day'
  from generate_series(1, 7000) g`)
console.log('\nrow distribution:')
console.log(await q(`select tableoid::regclass::text as partition, count(*)::int4 as rows
  from events group by 1 order by 1`))

// 4. partition pruning: a WHERE on created_at only touches matching partitions
const plan = await q(`explain (costs off) select count(*) from events where created_at >= now() - interval '1 day'`)
console.log('\npruned plan (only ~2 partitions scanned):')
for (const r of plan) console.log(' ', (r as { 'QUERY PLAN': string })['QUERY PLAN'])

// 5. retention: partitions fully older than 3 days get DETACHED (kept as plain tables, not dropped)
await c.query(`update partman.part_config
  set retention = '3 days', retention_keep_table = true where parent_table = 'public.events'`)
await c.query(`call partman.run_maintenance_proc()`)
console.log('\nafter run_maintenance with retention=3 days:')
console.log('  still attached:', (await q(`select count(*)::int4 as n from pg_partition_tree('public.events') where isleaf`))[0])
const detached = await q(`select schemaname || '.' || tablename as t from pg_tables
  where tablename like 'events_p%' and not exists (
    select 1 from pg_partition_tree('public.events') pt where pt.relid = (schemaname || '.' || tablename)::regclass)
  order by 1`)
console.log('  detached (standalone tables now):', detached)

// 6. the cold-tier handoff: a detached partition is a plain table — export it, then drop it
if (detached.length) {
  const t = (detached[0] as { t: string }).t
  const rows = await c.cursor({ sql: `select id, kind, created_at from ${t}`, fetchSize: 5000,
    shape: { id: 'bigint:number', kind: 'text', created_at: 'timestamptz' } }).all()
  console.log(`\ncold handoff: drained ${rows.length} rows from ${t} (→ parquet/S3 in real life), dropping it`)
  await c.query(`drop table ${t}`)
}

await c.query(`drop table public.events cascade`)
await c.query(`delete from partman.part_config where parent_table = 'public.events'`)
await c.end()
process.exit(0)
