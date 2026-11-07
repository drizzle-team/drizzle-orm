import { int, procedure } from 'drizzle-orm/pg-core'

procedure('countup', { limit: 'int' }, (ctx) => {
  const { notice } = ctx
  const { limit } = ctx.args
  for (let i = 0; i < limit; i = i + 1) {
    notice(i)
  }
})
