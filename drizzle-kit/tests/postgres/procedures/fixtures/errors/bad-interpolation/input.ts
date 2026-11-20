import { numeric, procedure } from 'drizzle-orm/pg-core'

procedure('bump', { amount: 'numeric' }, (ctx) => {
  const { args, sql } = ctx
  sql`UPDATE accounts SET balance = balance + ${args.amount * 2}`
})
