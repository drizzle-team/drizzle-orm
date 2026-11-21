import { bigint_, numeric, procedure } from 'drizzle-orm/pg-core'

procedure('peek', { account: 'bigint' }, (ctx) => {
  const { sql, notice } = ctx
  const { account } = ctx.args
  const hold = sql`SELECT amount FROM holds WHERE account_id = ${account}`.maybeOne<{ amount: numeric }>()
  notice(hold.row.amount)
})
