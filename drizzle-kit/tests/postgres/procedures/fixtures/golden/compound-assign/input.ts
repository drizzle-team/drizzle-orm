import { int, procedure, text } from 'drizzle-orm/pg-core'

procedure('build_label', { suffix: 'text' }, (ctx) => {
  const { notice } = ctx
  const { suffix } = ctx.args
  let s: text = 'a'
  s += suffix
  let i: int = 0
  i += 1
  notice(s)
  notice(i)
})
