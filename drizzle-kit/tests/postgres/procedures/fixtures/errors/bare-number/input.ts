import { int, procedure } from 'drizzle-orm/pg-core'

procedure('tally', { qty: 'int' }, (ctx) => {
  const { qty } = ctx.args
  let total: number = 0
  total = total + qty
})
