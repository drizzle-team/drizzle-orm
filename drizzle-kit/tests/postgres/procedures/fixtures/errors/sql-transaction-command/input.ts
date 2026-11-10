import { procedure } from 'drizzle-orm/pg-core'

procedure('raw_txn', { id: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { id } = ctx.args
  sql`UPDATE accounts SET frozen = true WHERE id = ${id}`
  sql`COMMIT`
  sql`SAVEPOINT before_fee`
  sql`ROLLBACK TO SAVEPOINT before_fee`
  sql`BEGIN`
})
