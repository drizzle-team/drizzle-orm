import { int, procedure } from 'drizzle-orm/pg-core'

procedure('drain', { amount: 'int' }, (ctx) => {
  const { amount } = ctx.args
  amount = amount - 1
})
