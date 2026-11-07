import { numeric, procedure } from 'drizzle-orm/pg-core'

procedure('flagAccount', { account: 'bigint' }, (ctx) => {
  const { sql, notice } = ctx
  const { account } = ctx.args
  const r = sql`UPDATE accounts SET flagged = true WHERE id = ${account}`
  if (r?.found) {
    notice('flagged')
  }
  const row = sql`SELECT balance FROM accounts WHERE id = ${account}`.one<{ balance: numeric }>()
  notice(row?.balance)
})
