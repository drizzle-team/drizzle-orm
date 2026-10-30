// Cross-driver RESULT PARITY check for the decode-vs bench. Confirms minipg (interpreted AND JIT,
// array AND object mode) decodes the bench's exact query identically to pg, postgres.js and Bun.sql
// — and to the canonical expected values computed from the SQL. If every driver matches `expected`,
// they all agree with each other, so the bench compares apples-to-apples.
//
// Same query + unix socket as bench/decode-vs.bench.ts.
//   bun bench/decode-parity.ts      (or: bun run bench:parity)   -- needs `bun run test:setup`
import { Pool as PgPool } from 'pg'
import postgres from 'postgres'
import { SQL } from 'bun'
import { connect } from '../src/index.ts'                 // interpreted decode path
import { connect as connectJit } from '../src/index.ts' // JIT/codegen decode path

const SOCK_DIR = '/tmp/minipg_sock', SOCK_PATH = SOCK_DIR + '/.s.PGSQL.54329'
const PORT = 54329, USER = 'postgres', DB = 'testdb'

// the bench's exact query: 3 int4 + text + bool
const mkSql = (n: number) => `select g::int4 as id, (g*2)::int4 as a, (g*3)::int4 as b, ('name_'||g) as name, (g%2=0) as ok from generate_series(1, ${n}) g`

// canonical expected rows, derived from the SQL (the oracle every driver must match)
type Row = { id: number; a: number; b: number; name: string; ok: boolean }
const expected = (n: number): Row[] => Array.from({ length: n }, (_, i) => { const g = i + 1; return { id: g, a: g * 2, b: g * 3, name: 'name_' + g, ok: g % 2 === 0 } })

// normalize any driver's row (object or positional) into the same plain shape + key order
const normObj = (r: any): Row => ({ id: r.id, a: r.a, b: r.b, name: r.name, ok: r.ok })
const normArr = (r: any): Row => ({ id: r[0], a: r[1], b: r[2], name: r[3], ok: r[4] })

const mc = await connect({ path: SOCK_PATH, user: USER, database: DB, password: '' })       // minipg interpreted
const mj = await connectJit({ path: SOCK_PATH, user: USER, database: DB, password: '' })     // minipg JIT/codegen
const pgp = new PgPool({ host: SOCK_DIR, port: PORT, user: USER, database: DB, max: 1 })     // pg
const sql = postgres({ host: SOCK_DIR, port: PORT, user: USER, database: DB, max: 1 })       // postgres.js
const bunsql = new SQL({ adapter: 'postgres', path: SOCK_PATH, username: USER, database: DB }) // Bun.sql

// Bun.sql tagged template (sql``) per size — literal, prepared + cached by template identity.
const bunTagged: Record<number, () => Promise<any>> = {
  100: () => bunsql`select g::int4 as id, (g*2)::int4 as a, (g*3)::int4 as b, ('name_'||g) as name, (g%2=0) as ok from generate_series(1, 100) g`,
  1000: () => bunsql`select g::int4 as id, (g*2)::int4 as a, (g*3)::int4 as b, ('name_'||g) as name, (g%2=0) as ok from generate_series(1, 1000) g`,
}

// every source, normalized to Row[]
async function sources(n: number): Promise<Record<string, Row[]>> {
  return {
    'minipg interp (object)': (await mc.query(mkSql(n), [], { mode: 'object' })).rows.map(normObj),
    'minipg interp (array) ': (await mc.query(mkSql(n))).rows.map(normArr),
    'minipg JIT    (object)': (await mj.query(mkSql(n), [], { mode: 'object' })).rows.map(normObj),
    'minipg JIT    (array) ': (await mj.query(mkSql(n))).rows.map(normArr),
    'pg            (object)': (await pgp.query(mkSql(n))).rows.map(normObj),
    'postgres.js   (object)': Array.from(await sql.unsafe(mkSql(n))).map(normObj),
    'Bun.sql       (object)': (await bunTagged[n]!()).map(normObj),
  }
}

let fails = 0
for (const n of [100, 1000]) {
  console.log(`\n=== ${n} rows · select id int4, a int4, b int4, name text, ok bool ===`)
  const exp = expected(n)
  const expJson = JSON.stringify(exp)
  for (const [name, rows] of Object.entries(await sources(n))) {
    if (JSON.stringify(rows) === expJson) { console.log(`  ok    ${name}  (${rows.length} rows)`); continue }
    fails++
    let idx = 0
    while (idx < Math.max(exp.length, rows.length) && JSON.stringify(exp[idx]) === JSON.stringify(rows[idx])) idx++
    console.log(`  FAIL  ${name}  rows=${rows.length} (expected ${exp.length}); first diff @${idx}:`)
    console.log(`          expected: ${JSON.stringify(exp[idx])}`)
    console.log(`          got     : ${JSON.stringify(rows[idx])}`)
  }
}

console.log(fails === 0 ? '\n✓ ALL DRIVERS RETURN IDENTICAL RESULTS\n' : `\n✗ ${fails} MISMATCH(ES)\n`)
await mc.end(); await mj.end(); await pgp.end(); await sql.end({ timeout: 5 }); await bunsql.end()
process.exit(fails === 0 ? 0 : 1)
