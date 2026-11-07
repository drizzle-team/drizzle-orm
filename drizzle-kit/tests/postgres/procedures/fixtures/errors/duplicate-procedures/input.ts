import { procedure } from 'drizzle-orm/pg-core'

procedure('foo', { msg: 'text' }, (ctx) => {
  const { notice } = ctx
  const { msg } = ctx.args
  notice(msg)
})

procedure('Foo', { msg: 'text' }, (ctx) => {
  const { notice } = ctx
  const { msg } = ctx.args
  notice(msg)
})
