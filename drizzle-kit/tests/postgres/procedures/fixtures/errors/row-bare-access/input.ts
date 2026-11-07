import { bigint_, procedure, text } from 'drizzle-orm/pg-core'

procedure('showName', { id: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { id } = ctx.args
  const res = sql`SELECT name FROM users WHERE id = ${id}`.maybeOne<{ name: text }>()
  if (res.found) {
    const x: text = res.row
  }
})
