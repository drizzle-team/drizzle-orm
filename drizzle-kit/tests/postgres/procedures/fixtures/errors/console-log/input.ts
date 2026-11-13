import { procedure, text } from 'drizzle-orm/pg-core'

procedure('greet', { name: 'text' }, (ctx) => {
  const { name } = ctx.args
  console.log('hello', name)
})
