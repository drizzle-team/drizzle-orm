import { int, procedure } from 'drizzle-orm/pg-core'

procedure('check_qty', { qty: 'int' }, (ctx) => {
  const { notice } = ctx
  const { qty } = ctx.args
  if (qty) {
    notice('non-zero')
  }
})
