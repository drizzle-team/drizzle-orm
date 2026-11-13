import { procedure } from 'drizzle-orm/pg-core'

procedure('args_object', { account: 'bigint', fee: 'numeric' }, (ctx) => {
  const { sql, notice } = ctx
  notice(ctx.args.fee)
  const { account } = ctx.args
  const bill = sql`UPDATE accounts SET balance = balance - ${ctx.args.fee} WHERE id = ${account}`
  if (bill.count === 0) {
    notice('missing account')
  }
})
