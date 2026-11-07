import { int, procedure } from 'drizzle-orm/pg-core'

procedure('compute', { x: 'int' }, (ctx) => {
  const { x } = ctx.args
  Math.abs(x)
  helper()
})
