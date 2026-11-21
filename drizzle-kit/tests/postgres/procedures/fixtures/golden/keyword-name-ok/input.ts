import { procedure } from 'drizzle-orm/pg-core'

procedure('left', {}, (ctx) => {
  const { notice } = ctx
  notice('left is a type_func_name keyword, legal as a routine name')
})
