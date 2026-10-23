// Compute embeddings for issues and/or comments. Resumable (only WHERE embedding IS NULL).
//   node embed.mjs [issues|comments|all]
import { openDb } from './lib.mjs'
import { embed, toVec, clip } from './embed-lib.mjs'

const target = (process.argv[2] || 'all').toLowerCase()
const db = await openDb()
const BATCH = 64

async function run(table, selectSql, updateSql, keyOf, textOf, logEvery) {
  const { rows } = await db.query(selectSql)
  console.log(`${table}: ${rows.length} rows to embed`)
  const t0 = Date.now()
  let done = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const vecs = await embed(slice.map(textOf))
    await db.exec('BEGIN')
    for (let j = 0; j < slice.length; j++) await db.query(updateSql, [toVec(vecs[j]), ...keyOf(slice[j])])
    await db.exec('COMMIT')
    done += slice.length
    if (done % logEvery === 0 || done === rows.length) {
      const rate = done / ((Date.now() - t0) / 1000)
      console.log(`  ${table} ${done}/${rows.length} (${rate.toFixed(0)}/s)`)
    }
  }
}

if (target === 'issues' || target === 'all') {
  await run('issues',
    'SELECT repo, number, title, body FROM issues WHERE embedding IS NULL ORDER BY repo, number',
    'UPDATE issues SET embedding=$1::vector WHERE repo=$2 AND number=$3',
    (r) => [r.repo, r.number],
    (r) => clip((r.title || '') + '. ' + (r.body || ''), 2000),
    320)
}
if (target === 'comments' || target === 'all') {
  await run('comments',
    'SELECT id, body FROM comments WHERE embedding IS NULL ORDER BY id',
    'UPDATE comments SET embedding=$1::vector WHERE id=$2',
    (r) => [r.id],
    (r) => clip(r.body, 2000),
    640)
}

await db.close() // flush to disk
console.log('done; flushed to .pgdata')
