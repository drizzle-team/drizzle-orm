import { procedure } from 'drizzle-orm/pg-core'

procedure('$transfer', { id: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { id } = ctx.args
  sql`DELETE FROM transfers WHERE id = ${id}`
})
