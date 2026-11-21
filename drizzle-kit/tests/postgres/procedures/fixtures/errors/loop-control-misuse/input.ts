import { int, procedure } from 'drizzle-orm/pg-core'

procedure('drain', { n: 'int' }, (ctx) => {
  const { n } = ctx.args
  let i: int = 0
  if (n > 0) {
    break
  }
  continue
  while (i < n) {
    i = i + 1
  }
})
