import { procedure } from 'drizzle-orm/pg-core'

procedure('ctx_misuse', { account: 'bigint' }, (ctx) => {
  const { notice, sql } = ctx
  notice(ctx)
  notice(ctx.balance)
  notice(ctx.args.balance)
  ctx.args.account = 0
  const s = sql
})
