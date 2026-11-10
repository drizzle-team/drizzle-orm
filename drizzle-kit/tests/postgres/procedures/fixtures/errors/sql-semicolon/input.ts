import { bigint_, procedure } from 'drizzle-orm/pg-core'

procedure('remove_session', { id: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { id } = ctx.args
  sql`DELETE FROM sessions WHERE id = ${id};`
})
