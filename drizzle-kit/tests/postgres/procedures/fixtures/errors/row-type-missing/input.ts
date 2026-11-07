import { bigint_, procedure } from 'drizzle-orm/pg-core'

procedure('lookup', { id: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { id } = ctx.args
  const row = sql`SELECT id FROM t WHERE id = ${id}`.one()
})
