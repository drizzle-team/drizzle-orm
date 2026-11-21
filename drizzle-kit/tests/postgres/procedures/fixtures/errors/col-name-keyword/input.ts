import { procedure } from 'drizzle-orm/pg-core'

procedure('values', { id: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { id } = ctx.args
  sql`DELETE FROM staging WHERE id = ${id}`
})
