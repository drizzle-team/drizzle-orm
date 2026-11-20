import { int, procedure } from 'drizzle-orm/pg-core'

procedure('reserve', { qty: 'int' }, (ctx) => {
  const { notice } = ctx
  const { qty } = ctx.args
  let total: int
  notice(qty)
})
