import { int, procedure } from 'drizzle-orm/pg-core'

procedure('settle', { id: 'bigint' }, (ctx) => {
  const { sql, notice } = ctx
  const { id } = ctx.args
  const upd__count: int = 1
  const upd = sql`UPDATE accounts SET settled = true WHERE id = ${id}`
  notice(upd__count)
})
