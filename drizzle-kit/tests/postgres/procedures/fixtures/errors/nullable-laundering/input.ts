import { numeric, procedure } from 'drizzle-orm/pg-core'

procedure('settle', { account: 'bigint' }, (ctx) => {
  const { sql, notice } = ctx
  const { account } = ctx.args
  const h = sql`SELECT amount FROM holds WHERE account_id = ${account}`.maybeOne<{ amount: numeric | null }>()
  if (h.found) {
    const b: numeric = h.row.amount
    let c: numeric = 0
    c = h.row.amount
    notice(c)
  }
})
