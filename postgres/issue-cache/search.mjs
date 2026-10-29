// Semantic search over the cache.
//   node search.mjs "connection drops then queries hang"
//   node search.mjs --comments --limit 15 "prepared statement already exists"
//   node search.mjs --all --repo postgres.js "bigint parsed as string"
import { openDb } from './lib.mjs'
import { embed, toVec } from './embed-lib.mjs'

const args = process.argv.slice(2)
let mode = 'issues', limit = 12, repo = null
const q = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--comments') mode = 'comments'
  else if (a === '--all') mode = 'all'
  else if (a === '--limit') limit = Number(args[++i])
  else if (a === '--repo') repo = args[++i]
  else q.push(a)
}
const query = q.join(' ')
if (!query) {
  console.log('usage: node search.mjs [--comments|--all] [--limit N] [--repo postgres.js|node-postgres] "<query>"')
  process.exit(1)
}

const db = await openDb()
const [v] = await embed([query])
const vec = toVec(v)
const repoFilter = repo ? ` AND repo='${repo.replace(/'/g, "''")}'` : ''

if (mode === 'issues' || mode === 'all') {
  const r = await db.query(
    `SELECT repo, number, state, round((1-(embedding<=>$1))::numeric,3) AS sim, left(title,70) AS title
     FROM issues WHERE embedding IS NOT NULL${repoFilter} ORDER BY embedding<=>$1 LIMIT $2`, [vec, limit])
  console.log(`\n# Issues ~ "${query}"`)
  console.table(r.rows)
}
if (mode === 'comments' || mode === 'all') {
  const r = await db.query(
    `SELECT repo, issue_number, round((1-(embedding<=>$1))::numeric,3) AS sim,
            left(regexp_replace(body,'\\s+',' ','g'),90) AS snippet
     FROM comments WHERE embedding IS NOT NULL${repoFilter} ORDER BY embedding<=>$1 LIMIT $2`, [vec, limit])
  console.log(`\n# Comments ~ "${query}"`)
  console.table(r.rows)
}
await db.close()
