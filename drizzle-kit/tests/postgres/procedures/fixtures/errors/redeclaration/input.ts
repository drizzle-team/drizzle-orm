import { int, procedure } from 'drizzle-orm/pg-core'

procedure('bump', { id: 'int' }, (ctx) => {
  const { notice } = ctx
  const { id } = ctx.args
  const x: int = 1
  if (id === 0) {
    const x: int = 2
    notice(x)
  }
  notice(x)
})
