import { procedure } from 'drizzle-orm/pg-core'

procedure('inconsistent', { qty: 'int' }, (ctx) => {
  const { qty } = ctx.args
  if (qty > 0) {
    return { total: qty }
  }
  return { count: qty }
})
