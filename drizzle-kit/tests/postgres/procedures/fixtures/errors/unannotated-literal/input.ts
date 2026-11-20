import { int, procedure } from 'drizzle-orm/pg-core'

procedure('tally', { qty: 'int' }, (ctx) => {
  const { qty } = ctx.args
  const x = 1
})
