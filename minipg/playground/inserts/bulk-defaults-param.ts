// Verify the new bulkInsert({ defaults: true }) option end-to-end.
//   bun run test:setup
//   bun playground/inserts/bulk-defaults-param.ts
import { connect } from '../../src/index.ts'

const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'
const DB = { user: 'postgres', database: 'testdb' }
const mc = await connect({ path: SOCK, ...DB })
const line = (s: string) => console.log('\n' + '─'.repeat(72) + '\n' + s + '\n' + '─'.repeat(72))
let fails = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${msg}`); if (!cond) fails++ }

await mc.query('drop table if exists bd_param')
await mc.query('drop sequence if exists bd_param_seq')
await mc.query('create sequence bd_param_seq')
await mc.query(`create table bd_param(
  id         int8 primary key,
  name       text        not null,
  status     text        default 'pending',
  qty        int4        not null default 0,      -- NOT NULL + default: the old crash case
  created_at timestamptz default now(),
  tok        int8        default nextval('bd_param_seq')  -- volatile per-row default
)`)

const cols = { id: 'int8', name: 'text', status: 'text', qty: 'int4', created_at: 'timestamptz', tok: 'int8' } as const
const OLD = new Date('2020-01-01T00:00:00Z')

// ── Scenario 1 · object rows: undefined→DEFAULT, null→NULL, value→value ──────
line('Scenario 1 · object rows — undefined→DEFAULT, explicit null→NULL')
{
  const rows = Array.from({ length: 100 }, (_, i) => {
    if (i === 7) return { id: i + 1, name: `row_${i}`, status: null, qty: 5, created_at: OLD, tok: 999 } // explicit NULL status
    if (i % 3 === 0) return { id: i + 1, name: `row_${i}` } // status/qty/created_at/tok all undefined → DEFAULT
    return { id: i + 1, name: `row_${i}`, status: 'active', qty: i, created_at: OLD, tok: 10_000 + i }
  })
  const r = await mc.query('truncate bd_param').then(() =>
    mc.bulkInsert('bd_param', cols, rows, { returning: 'id', defaults: true }))
  ok(r.rowCount === 100, `inserted 100 rows (rowCount=${r.rowCount}) — no NOT NULL violation on qty`)
  ok(r.rows.length === 100, `returning yielded 100 ids in input order (first=${(r.rows[0] as unknown as unknown[])[0]})`)

  const q = (sql: string) => mc.query(sql, [], { mode: 'object' }).then((x) => x.rows[0] as Record<string, string>)
  const defaulted = await q(`select count(*)::text n from bd_param where status='pending' and qty=0 and created_at >= date '2021-01-01' and (id-1)%3=0`)
  ok(defaulted.n === '34', `34 undefined-rows took all defaults ('pending',0,now(),nextval) [n=${defaulted.n}]`) // i=0,3,…,99 → 34 rows, none is i=7
  const nullRow = await q(`select (status is null)::text as isnull, qty::text q from bd_param where id=8`)
  ok(nullRow.isnull === 'true' && nullRow.q === '5', `explicit null row: status IS NULL (not 'pending'), qty=5 [${nullRow.isnull},${nullRow.q}]`)
  const tok = await q(`select count(distinct tok)::text d from bd_param where (id-1)%3=0`)
  ok(tok.d === '34', `34 defaulted rows each got a DISTINCT tok (per-row nextval) [distinct=${tok.d}]`)
}

// ── Scenario 2 · array rows + forced chunking ───────────────────────────────
line('Scenario 2 · array rows, small chunk → multi-chunk path, returning order')
{
  const rows = Array.from({ length: 50 }, (_, i) =>
    i % 2 === 0 ? [i + 1, `a_${i}`, undefined, undefined, undefined, undefined]  // DEFAULT everything defaultable
                : [i + 1, `a_${i}`, 'set', i, OLD, 500 + i])
  const r = await mc.query('truncate bd_param').then(() =>
    mc.bulkInsert('bd_param', cols, rows, { returning: 'id', chunk: 7, defaults: true })) // 50/7 = 8 chunks
  ok(r.rowCount === 50, `inserted 50 array-rows across chunks (rowCount=${r.rowCount})`)
  const ids = (r.rows as unknown[][]).map((row) => Number(row[0]))
  ok(ids.length === 50 && ids.every((v, i) => v === i + 1), 'returning ids concatenated in input order across chunks')
  const d = await mc.query(`select count(*)::text n from bd_param where status='pending' and qty=0`, [], { mode: 'object' })
  ok((d.rows[0] as { n: string }).n === '25', `25 even rows took DEFAULT for status+qty [n=${(d.rows[0] as { n: string }).n}]`)
}

// ── Scenario 3 · a fully-defaulted row (all cells DEFAULT except pk) ─────────
line('Scenario 3 · row that is DEFAULT for every non-key column')
{
  await mc.query('truncate bd_param')
  const r = await mc.bulkInsert('bd_param', cols, [{ id: 1, name: 'solo' }], { returning: 'status, qty, tok', defaults: true })
  const row = r.rows[0] as unknown as [string, number, string]
  ok(row[0] === 'pending' && Number(row[1]) === 0, `single all-default row → status='pending', qty=0 [${row[0]},${row[1]}]`)
}

await mc.query('drop table if exists bd_param')
await mc.query('drop sequence if exists bd_param_seq')
await mc.end()
console.log(`\n${fails === 0 ? '✅ all checks passed' : `❌ ${fails} check(s) failed`}`)
process.exitCode = fails === 0 ? 0 : 1
