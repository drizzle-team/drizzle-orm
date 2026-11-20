import { int, procedure } from 'drizzle-orm/pg-core'

procedure('report', {}, (ctx) => {
  const { notice } = ctx
  notice(x)
  const x: int = 1
})
