import { bigint_, procedure } from 'drizzle-orm/pg-core'

procedure('scan', { account: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { account } = ctx.args
  sql`SELECT id FROM entries WHERE account_id = ${account}`.many<{ id: bigint_ }>()
})
