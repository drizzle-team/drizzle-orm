import { procedure } from 'drizzle-orm/pg-core'
import { accounts } from '../../../schema'

procedure('probe', { id: 'bigint' }, (ctx) => {
  const { args, sql } = ctx
  sql`UPDATE ${accounts} SET ${accounts.credit} = 0 WHERE ${accounts.id} = ${args.id}`
})
