import { int, procedure } from 'drizzle-orm/pg-core'

procedure('compareCounts', { a: 'int', b: 'int' }, (ctx) => {
  const { notice } = ctx
  const { a, b } = ctx.args
  if (a == b) {
    notice('equal')
  }
})
