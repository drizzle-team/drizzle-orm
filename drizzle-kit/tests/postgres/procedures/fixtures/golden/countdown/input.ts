import { int, procedure, text } from 'drizzle-orm/pg-core'

procedure('countdown', { start: 'int' }, (ctx) => {
  const { notice } = ctx
  const { start } = ctx.args
  let remaining: int = start
  while (remaining > 0) {
    const label: text = remaining % 2 === 0 ? 'even' : 'odd'
    notice('tick ' + label)
    remaining = remaining - 1
  }
  notice('liftoff')
})
