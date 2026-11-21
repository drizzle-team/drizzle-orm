import { procedure } from 'drizzle-orm/pg-core'

procedure('grant', { id: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { id } = ctx.args
  sql`DELETE FROM grants WHERE id = ${id}`
})
