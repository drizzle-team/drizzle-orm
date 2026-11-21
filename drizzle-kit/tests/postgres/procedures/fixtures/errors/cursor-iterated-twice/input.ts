import { procedure } from 'drizzle-orm/pg-core'

procedure('rescan', { account: 'bigint' }, (ctx) => {
  const { sql, notice } = ctx
  const rows = sql`SELECT id FROM entries WHERE account_id = ${ctx.args.account}`.many()
  for (const row of rows) {
    notice('first pass')
  }
  for (const row2 of rows) {
    notice('second pass')
  }
})
