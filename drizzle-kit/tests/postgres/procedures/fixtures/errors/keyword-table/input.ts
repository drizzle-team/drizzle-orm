import { procedure } from 'drizzle-orm/pg-core'

procedure('closeOrder', { a: 'bigint' }, (ctx) => {
  const { sql, lockRowsOrdered } = ctx
  const { a } = ctx.args
  lockRowsOrdered('order', [a])
  sql`UPDATE orders SET closed = true WHERE id = ${a}`
})
