import { bigint_, procedure } from 'drizzle-orm/pg-core'

procedure('audit', { account: 'bigint' }, (ctx) => {
  const { sql, notice } = ctx
  const rows = sql`SELECT id FROM entries WHERE account_id = ${ctx.args.account}`.many<{ id: bigint_ }>()
  notice('done')
})
