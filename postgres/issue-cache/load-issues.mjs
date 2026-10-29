// Load issues from corpus.json into the PGlite cache (idempotent upsert).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDb, HERE } from './lib.mjs'

const db = await openDb()
const issues = JSON.parse(readFileSync(join(HERE, 'corpus.json'), 'utf8'))

const COLS = ['repo', 'number', 'title', 'body', 'state', 'created_at', 'closed_at', 'url', 'labels', 'comments_count']
// per-column cast for the VALUES placeholders
const CAST = { created_at: '::timestamptz', closed_at: '::timestamptz', labels: '::jsonb' }

function rowValues(it) {
  return [
    it.repo, it.number, it.title || null, it.body || null, it.state || null,
    it.createdAt || null, it.closedAt || null, it.url || null,
    JSON.stringify(it.labels || []), it.comments ?? it.comments_count ?? 0,
  ]
}

const BATCH = 400
let n = 0
await db.exec('BEGIN')
for (let i = 0; i < issues.length; i += BATCH) {
  const slice = issues.slice(i, i + BATCH)
  const params = []
  const tuples = slice.map((it, r) => {
    const ph = COLS.map((c, ci) => {
      params.push(rowValues(it)[ci])
      return `$${r * COLS.length + ci + 1}${CAST[c] || ''}`
    })
    return `(${ph.join(',')})`
  })
  const sql = `INSERT INTO issues (${COLS.join(',')}) VALUES ${tuples.join(',')}
    ON CONFLICT (repo, number) DO UPDATE SET
      title=EXCLUDED.title, body=EXCLUDED.body, state=EXCLUDED.state,
      created_at=EXCLUDED.created_at, closed_at=EXCLUDED.closed_at, url=EXCLUDED.url,
      labels=EXCLUDED.labels, comments_count=EXCLUDED.comments_count`
  await db.query(sql, params)
  n += slice.length
}
await db.exec('COMMIT')

const { rows } = await db.query(`SELECT repo, count(*)::int AS n,
  count(*) FILTER (WHERE state='open')::int AS open,
  count(*) FILTER (WHERE state='closed')::int AS closed,
  sum(comments_count)::int AS gh_comments
  FROM issues GROUP BY repo ORDER BY repo`)
console.log(`Loaded/updated ${n} issues. Cache at ${join(HERE, '.pgdata')}`)
console.table(rows)
