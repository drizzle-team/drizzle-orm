import { bigint_, numeric, procedure } from 'drizzle-orm/pg-core'

procedure('risky', { account: 'bigint' }, (ctx) => {
  const { sql, notice } = ctx
  const { account } = ctx.args
  const hold = sql`SELECT amount FROM holds WHERE account_id = ${account}`.maybeOne<{ amount: numeric | null }>()
  if (hold.found) {
    if (hold.row.amount > 100) {
      notice('big hold')
    }
  }
})
