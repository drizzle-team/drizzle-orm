import { procedure } from 'drizzle-orm/pg-core'

procedure('broken', { account: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { account } = ctx.args
  console.log('the visitor would reject this, but the parse error must win')
  const = sql`SELECT balance FROM accounts WHERE id = ${account}`
})
