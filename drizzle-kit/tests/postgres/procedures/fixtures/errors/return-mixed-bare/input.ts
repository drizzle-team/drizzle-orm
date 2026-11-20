import { procedure } from 'drizzle-orm/pg-core'

procedure('mixed', { qty: 'int' }, (ctx) => {
  const { qty } = ctx.args
  if (qty > 0) {
    return
  }
  return { total: qty }
})
