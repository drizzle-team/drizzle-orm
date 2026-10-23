// Prototype: batch-stream export pipeline. Formatters are AsyncIterable<Row[]> -> AsyncIterable<string>
// transformers — composable with cursor.batches(), arrays, anything. Constant memory by construction:
// one output chunk per input batch, backpressure via the sink's await.
//   bun playground/export/proto.ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { connect } from '../../src/index.ts'

type Row = Record<string, unknown>
type Batches = AsyncIterable<Row[]> | Iterable<Row[]>

// ---- value serializers (shared) -------------------------------------------------------------
const isoOf = (d: Date): string => d.toISOString()
const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  let s: string
  switch (typeof v) {
    case 'string': s = v; break
    case 'number': case 'boolean': return String(v)
    case 'bigint': return v.toString()
    default: s = v instanceof Date ? isoOf(v) : Buffer.isBuffer(v) ? '\\x' + v.toString('hex') : JSON.stringify(v)
  }
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const jsonVal = (v: unknown): string => {
  if (v === null || v === undefined) return 'null'
  switch (typeof v) {
    case 'bigint': return v.toString() // exact digits — JSON.stringify would throw
    case 'string': return JSON.stringify(v)
    case 'number': case 'boolean': return String(v)
    default: return v instanceof Date ? `"${isoOf(v)}"` : Buffer.isBuffer(v) ? `"\\\\x${v.toString('hex')}"` : JSON.stringify(v)
  }
}
const sqlLit = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL'
  switch (typeof v) {
    case 'number': case 'bigint': return String(v)
    case 'boolean': return v ? 'true' : 'false'
    case 'string': return "'" + v.replace(/'/g, "''") + "'"
    default:
      if (v instanceof Date) return `'${isoOf(v)}'`
      if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'`
      return "'" + JSON.stringify(v).replace(/'/g, "''") + "'"
  }
}

// ---- formatters: batches -> string chunks ----------------------------------------------------
export async function* toCSV(src: Batches, opts: { header?: boolean } = {}): AsyncGenerator<string> {
  let cols: string[] | null = null
  for await (const batch of src) {
    if (!batch.length) continue
    const parts: string[] = []
    if (!cols) { cols = Object.keys(batch[0]!); if (opts.header !== false) parts.push(cols.map(csvCell).join(',')) }
    for (const row of batch) { const c: string[] = []; for (const k of cols) c.push(csvCell(row[k])); parts.push(c.join(',')) }
    yield parts.join('\n') + '\n'
  }
}

export async function* toJSONL(src: Batches): AsyncGenerator<string> {
  let cols: string[] | null = null
  for await (const batch of src) {
    if (!batch.length) continue
    cols ??= Object.keys(batch[0]!)
    const parts: string[] = []
    for (const row of batch) {
      const f: string[] = []
      for (const k of cols) f.push(JSON.stringify(k) + ':' + jsonVal(row[k]))
      parts.push('{' + f.join(',') + '}')
    }
    yield parts.join('\n') + '\n'
  }
}

export async function* toJSON(src: Batches): AsyncGenerator<string> { // one valid JSON array, streamed
  let first = true
  for await (const batch of src) {
    if (!batch.length) continue
    const cols = Object.keys(batch[0]!)
    const parts: string[] = []
    for (const row of batch) {
      const f: string[] = []
      for (const k of cols) f.push(JSON.stringify(k) + ':' + jsonVal(row[k]))
      parts.push('{' + f.join(',') + '}')
    }
    yield (first ? '[' : ',') + parts.join(','); first = false
  }
  yield first ? '[]' : ']'
}

export async function* toInserts(src: Batches, opts: { table: string; chunk?: number; conflict?: 'nothing' }): AsyncGenerator<string> {
  const per = opts.chunk ?? 256
  const tail = opts.conflict === 'nothing' ? ' on conflict do nothing' : ''
  let cols: string[] | null = null, head = ''
  let tuples: string[] = []
  const flush = (): string => { const s = `${head}\n  ${tuples.join(',\n  ')}${tail};\n`; tuples = []; return s }
  for await (const batch of src) {
    for (const row of batch) {
      if (!cols) { cols = Object.keys(row); head = `insert into ${opts.table} (${cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')}) values` }
      const vals: string[] = []
      for (const k of cols) vals.push(sqlLit(row[k]))
      tuples.push('(' + vals.join(', ') + ')')
      if (tuples.length >= per) yield flush()
    }
  }
  if (tuples.length) yield flush()
}

// transform stage = a plain generator between source and formatter
export async function* mapRows(src: Batches, fn: (r: Row) => Row | null): AsyncGenerator<Row[]> {
  for await (const batch of src) {
    const out: Row[] = []
    for (const r of batch) { const m = fn(r); if (m !== null) out.push(m) }
    yield out
  }
}

// ---- bench ------------------------------------------------------------------------------------
if (import.meta.main) {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'minipg-export-'))
  const c = await connect({ path: '/tmp/minipg_sock/.s.PGSQL.54329', user: 'postgres', database: 'testdb' })
  await c.query('drop table if exists exp')
  await c.query('create table exp(id int8 primary key, name text, qty int4, price float8, flag bool, created_at timestamptz)')
  {
    const N = 1_000_000
    const rows: Row[] = new Array(N)
    for (let i = 0; i < N; i++) rows[i] = { id: i + 1, name: `n_${i}`, qty: i % 1000, price: i + 0.25, flag: i % 2 === 0, created_at: new Date(1767225600000 + (i % 86400) * 1000) }
    await c.copyMany('exp', { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' }, rows, { chunk: 250_000, atomic: false })
    await c.query('vacuum analyze exp')
  }
  const SHAPE = { id: 'bigint:number', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' } as const
  const batches = () => c.cursor({ sql: 'select * from exp', fetchSize: 20000, fullScan: true, shape: SHAPE as never }).batches() as AsyncIterable<Row[]>

  const lane = async (label: string, chunks: AsyncGenerator<string>, file: string): Promise<void> => {
    Bun.gc(true)
    const rss0 = process.memoryUsage().rss
    let peak = rss0
    const t0 = performance.now()
    const w = Bun.file(`${OUT}/${file}`).writer({ highWaterMark: 1 << 20 })
    let bytes = 0
    for await (const chunk of chunks) { bytes += chunk.length; await w.write(chunk); const r = process.memoryUsage().rss; if (r > peak) peak = r }
    await w.end()
    const ms = performance.now() - t0
    console.log(`${label.padEnd(34)} ${Math.round(ms).toString().padStart(5)}ms  ${Math.round(1e6 / (ms / 1000) / 1000).toString().padStart(5)}k rows/s  ${(bytes / 1048576).toFixed(1).padStart(7)}MB out  peak rssΔ ${((peak - rss0) / 1048576).toFixed(0).padStart(4)}MB`)
  }

  await lane('csv', toCSV(batches()), 'exp.csv')
  await lane('jsonl', toJSONL(batches()), 'exp.jsonl')
  await lane('json (single array)', toJSON(batches()), 'exp.json')
  await lane('sql inserts x256', toInserts(batches(), { table: 'exp2' }), 'exp.sql')
  await lane('transform -> csv', toCSV(mapRows(batches(), (r) => (r.flag as boolean) ? { id: r.id, total: (r.qty as number) * (r.price as number) } : null)), 'exp-t.csv')

  // correctness spot checks
  const head = await Bun.file(`${OUT}/exp.csv`).slice(0, 200).text()
  console.log('\ncsv head:', JSON.stringify(head.split('\n').slice(0, 2)))
  const jl = (await Bun.file(`${OUT}/exp.jsonl`).slice(0, 300).text()).split('\n')[0]!
  console.log('jsonl row parses:', JSON.stringify(JSON.parse(jl)).slice(0, 120))
  const sqlHead = (await Bun.file(`${OUT}/exp.sql`).slice(0, 300).text()).split('\n').slice(0, 2)
  console.log('sql head:', JSON.stringify(sqlHead))
  await c.query('drop table exp')
  await c.end()
  process.exit(0)
}
