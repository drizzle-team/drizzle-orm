import { procedure } from 'drizzle-orm/pg-core'

procedure('rename_owner', { name: 'text', id: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { name, id } = ctx.args
  sql`UPDATE owners SET name = '${name}' WHERE id = ${id}`
})
