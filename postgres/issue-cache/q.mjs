// Ad-hoc query helper:  node q.mjs "SELECT ... "
import { openDb } from './lib.mjs'
const db = await openDb()
const sql = process.argv.slice(2).join(' ')
if (!sql) {
  console.log('usage: node q.mjs "<SQL>"')
  process.exit(1)
}
const res = await db.query(sql)
console.table(res.rows)
process.exit(0)
