import { procedure } from 'drizzle-orm/pg-core'

procedure('label_batch', { suffix: 'text', id: 'int' }, (ctx) => {
  const { sql } = ctx
  const { suffix, id } = ctx.args
  sql`UPDATE batches SET label = ${suffix}x WHERE id = ${id}`
})

procedure('store_pair', { a: 'int', b: 'int' }, (ctx) => {
  const { sql } = ctx
  const { a, b } = ctx.args
  sql`INSERT INTO pairs (code) VALUES (${a}${b})`
})
