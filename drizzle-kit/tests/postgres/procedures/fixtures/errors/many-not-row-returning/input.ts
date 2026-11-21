import { procedure } from 'drizzle-orm/pg-core'

procedure('drain', { from: 'bigint', amount: 'numeric' }, (ctx) => {
  const { args, sql, notice } = ctx
  const debited = sql`UPDATE accounts SET balance = balance - ${args.amount} WHERE id = ${args.from}`.many()
  for (const row of debited) {
    notice('row')
  }
})
