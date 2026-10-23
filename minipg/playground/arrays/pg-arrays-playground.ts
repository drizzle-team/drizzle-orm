// Playground: PG array input + output design for minipg. No src changes — a scratch harness that
//  - prototypes the OUTPUT text-array parser (the missing piece), per postgres-array's algorithm
//  - exercises OPTION A input (JS array -> PG literal) via minipg's existing arrayLiteral()
//  - validates BOTH against node-postgres (canonical postgres-array)
//
// Run against any Postgres:  PGURL='postgres://…' bun playground/arrays/pg-arrays-playground.ts
// Defaults to the local test cluster (bun run test:setup). Never hardcode credentials here.
import { connect } from '../../src/index.ts'
import { arrayLiteral } from '../../src/encode.ts'
import pg from 'pg'

const URL = process.env.PGURL || 'postgres://postgres:postgres@127.0.0.1:54329/testdb'
const NEEDS_SSL = /sslmode=require|neon\.tech|\.rds\.|amazonaws/.test(URL)

let pass = 0, fail = 0
const ok = (n: string, c: boolean, extra?: unknown) => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}`, extra ?? '') } }

// ---- PROTOTYPE: parse a PG array text literal into a nested JS array ----
// decodeLeaf(str) decodes each non-null leaf. Handles nesting, quoted elements (backslash-escaped " and \),
// unquoted NULL, empty {}, and a leading [lb:ub]=… dimension prefix.
function parseArrayText(text: string, decodeLeaf: (s: string) => unknown): unknown[] {
  let i = 0
  if (text[0] === '[') { const eq = text.indexOf('='); if (eq >= 0) i = eq + 1 } // skip dimension prefix
  function arr(): unknown[] {
    const out: unknown[] = []
    i++ // consume '{'
    while (i < text.length) {
      const c = text[i]
      if (c === '}') { i++; break }
      if (c === ',') { i++; continue }
      if (c === '{') { out.push(arr()); continue }
      if (c === '"') { // quoted element (backslash-escaped)
        i++; let s = ''
        while (i < text.length) {
          const ch = text[i]!
          if (ch === '\\') { s += text[i + 1]; i += 2; continue }
          if (ch === '"') { i++; break }
          s += ch; i++
        }
        out.push(decodeLeaf(s)); continue
      }
      let j = i // unquoted element -> read to , or } ; bare NULL is SQL null
      while (j < text.length && text[j] !== ',' && text[j] !== '}') j++
      const raw = text.slice(i, j); i = j
      out.push(raw === 'NULL' ? null : decodeLeaf(raw))
    }
    return out
  }
  return arr()
}

// leaf decoders matching pg's element semantics (for apples-to-apples parity) …
function pgLeaf(elem: string): (s: string) => unknown {
  switch (elem) {
    case 'int2': case 'int4': return (s) => parseInt(s, 10)
    case 'float8': return (s) => parseFloat(s)
    case 'int8': return (s) => s // pg returns int8 as string
    case 'numeric': return (s) => parseFloat(s) // pg's numeric[] elements come back as (lossy) floats
    case 'bool': return (s) => s === 't'
    default: return (s) => s // text/uuid/…
  }
}
// … and minipg's precision-safe semantics (showcase).
function miniLeaf(elem: string): (s: string) => unknown {
  switch (elem) {
    case 'int2': case 'int4': return (s) => Number(s)
    case 'int8': return (s) => BigInt(s)
    case 'float8': return (s) => Number(s)
    case 'numeric': return (s) => s
    case 'bool': return (s) => s === 't'
    case 'timestamptz': return (s) => new Date(s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')) // PG '+00' → ISO '+00:00'
    case 'bytea': return (s) => (s.startsWith('\\x') ? Buffer.from(s.slice(2), 'hex') : Buffer.from(s, 'utf8'))
    default: return (s) => s
  }
}

function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'bigint' || typeof b === 'bigint') return String(a) === String(b)
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) return a.equals(b)
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]))
  return false
}

const mini = await connect(URL)
const pgc = new pg.Client({ connectionString: URL, ssl: NEEDS_SSL ? { rejectUnauthorized: false } : false })
await pgc.connect()

// ---- OUTPUT parity: parse minipg's raw array text, compare to node-postgres ----
console.log('=== OUTPUT: minipg-raw-text → my parser  vs  node-postgres (postgres-array) ===')
const CASES: Array<{ name: string; sql: string; elem: string }> = [
  { name: 'int4[] {1,2,3}', sql: `select '{1,2,3}'::int4[] a`, elem: 'int4' },
  { name: 'int4[] empty {}', sql: `select '{}'::int4[] a`, elem: 'int4' },
  { name: 'int4[] with NULLs', sql: `select '{1,NULL,3}'::int4[] a`, elem: 'int4' },
  { name: 'int4[][] nested', sql: `select '{{1,2},{3,4}}'::int4[] a`, elem: 'int4' },
  { name: 'int4[] custom bounds [2:4]', sql: `select '[2:4]={10,20,30}'::int4[] a`, elem: 'int4' },
  { name: 'int8[] big', sql: `select '{9223372036854775807,1}'::int8[] a`, elem: 'int8' },
  { name: 'numeric[]', sql: `select '{1.5,10.50,-0.001}'::numeric[] a`, elem: 'numeric' },
  { name: 'float8[]', sql: `select '{1.5,-3.5,0}'::float8[] a`, elem: 'float8' },
  { name: 'bool[]', sql: `select '{t,f,t}'::bool[] a`, elem: 'bool' },
  { name: 'text[] simple', sql: `select '{a,b,c}'::text[] a`, elem: 'text' },
  { name: 'text[] quoting/comma/quote/backslash/empty/spaced/NULL-word', sql: `select array['a,b','c"d','x'||chr(92)||'y','NULL','null','',' sp ']::text[] a`, elem: 'text' },
  { name: 'text[] with real null', sql: `select array['x',null,'z']::text[] a`, elem: 'text' },
  { name: 'text[] unicode', sql: `select array['café','日本語','😀']::text[] a`, elem: 'text' },
]
for (const c of CASES) {
  const rawText = (await mini.query(c.sql)).rows[0]![0] as string
  const mineForParity = parseArrayText(rawText, pgLeaf(c.elem))
  const pgVal = (await pgc.query(c.sql)).rows[0].a
  ok(`${c.name}  →  ${JSON.stringify(mineForParity)}`, eq(mineForParity, pgVal), `\n     raw=${rawText}\n     pg =${JSON.stringify(pgVal)}`)
}

console.log('\n=== OUTPUT: minipg precision semantics (int8→BigInt, timestamptz→Date, bytea→Buffer) ===')
{
  const r1 = (await mini.query(`select '{9223372036854775807,1}'::int8[] a`)).rows[0]![0] as string
  console.log('  int8[] →', parseArrayText(r1, miniLeaf('int8')))
  const r2 = (await mini.query(`select array['2024-01-15 10:30:45+00'::timestamptz,'2020-06-01 00:00:00+00'] a`)).rows[0]![0] as string
  console.log('  timestamptz[] →', parseArrayText(r2, miniLeaf('timestamptz')))
  const r3 = (await mini.query(`select array['\\xdeadbeef'::bytea, '\\x00ff'] a`)).rows[0]![0] as string
  console.log('  bytea[] →', parseArrayText(r3, miniLeaf('bytea')).map((b) => (b as Buffer).toString('hex')))
}

// ---- INPUT round-trip: Option A (arrayLiteral) and minipg's typed binary path ----
console.log('\n=== INPUT: Option A (JS array → arrayLiteral → PG cast) round-trips ===')
const INPUTS: Array<{ arr: unknown[]; type: string; elem: string }> = [
  { arr: [1, 2, 3], type: 'int4[]', elem: 'int4' },
  { arr: [], type: 'int4[]', elem: 'int4' },
  { arr: [1, null, 3], type: 'int4[]', elem: 'int4' },
  { arr: [[1, 2], [3, 4]], type: 'int4[]', elem: 'int4' },
  { arr: ['a,b', 'c"d', 'x\\y', null, '', ' sp ', 'NULL'], type: 'text[]', elem: 'text' },
  { arr: [9223372036854775807n, 1n], type: 'int8[]', elem: 'int8' },
]
for (const { arr, type, elem } of INPUTS) {
  const lit = arrayLiteral(arr)
  const back = parseArrayText((await mini.query(`select $1::${type} a`, [lit])).rows[0]![0] as string, pgLeaf(elem))
  const want = parseArrayText(arrayLiteral(arr), pgLeaf(elem))
  ok(`${type} ${JSON.stringify(arr, (_, v) => (typeof v === 'bigint' ? v + 'n' : v))}  lit=${lit}`, eq(back, want), `\n     back=${JSON.stringify(back)}`)
}

console.log('\n=== INPUT: minipg typed BINARY path (params:[…]) round-trips ===')
for (const { arr, type, elem } of INPUTS) {
  if (type === 'int8[]') continue
  const back = parseArrayText((await mini.query(`select $1 a`, [arr], { params: [type] } as never)).rows[0]![0] as string, pgLeaf(elem))
  const want = parseArrayText(arrayLiteral(arr), pgLeaf(elem))
  ok(`${type} via binary params ${JSON.stringify(arr)}`, eq(back, want), `\n     back=${JSON.stringify(back)}`)
}

await mini.end(); await pgc.end()
console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`)
process.exitCode = fail === 0 ? 0 : 1
