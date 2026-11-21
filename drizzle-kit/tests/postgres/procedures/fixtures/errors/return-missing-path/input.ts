import { procedure } from 'drizzle-orm/pg-core'

procedure('leaky', { qty: 'int' }, (ctx) => {
  const { qty } = ctx.args
  if (qty > 0) {
    return { total: qty }
  }
})
