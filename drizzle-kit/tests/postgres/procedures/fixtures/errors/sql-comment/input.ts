import { procedure } from 'drizzle-orm/pg-core'

procedure('touch_owner', { a: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { a } = ctx.args
  sql`UPDATE owners SET touched = true WHERE id = ${a} -- touch`
})
