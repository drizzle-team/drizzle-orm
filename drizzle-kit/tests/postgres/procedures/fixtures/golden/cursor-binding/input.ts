import { numeric, procedure } from 'drizzle-orm/pg-core'

// A bound cursor emits NOTHING at the binding — the query appears at the
// loop position (FOR ... IN <query> LOOP), after the UPDATE below.
procedure('review_holds', { account: 'bigint', threshold: 'numeric' }, (ctx) => {
  const { sql, notice } = ctx
  const { account, threshold } = ctx.args

  const holds = sql`SELECT amount FROM holds WHERE account_id = ${account}`.many<{ amount: numeric }>()

  sql`UPDATE accounts SET reviewed = true WHERE id = ${account}`

  for (const hold of holds) {
    if (hold.amount > threshold) {
      notice(hold.amount)
    }
  }
})
