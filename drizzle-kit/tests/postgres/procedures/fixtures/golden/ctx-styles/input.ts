import { procedure } from 'drizzle-orm/pg-core'

// All four access spellings lower to the same p_*/v_* identifiers:
// direct ctx.sql`...`, destructured `const { notice } = ctx`,
// `const { fee } = ctx.args`, and ctx.args.account inline.
procedure('ctx_styles', { account: 'bigint', fee: 'numeric' }, (ctx) => {
  const { notice } = ctx
  const { fee } = ctx.args
  notice(fee)
  const bill = ctx.sql`UPDATE accounts SET balance = balance - ${fee} WHERE id = ${ctx.args.account}`
  if (bill.count === 0) {
    notice('missing account')
  }
})
