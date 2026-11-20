import { procedure } from 'drizzle-orm/pg-core'
import { accounts } from '../../../schema'

procedure('misuse', {}, (ctx) => {
  const { notice } = ctx
  notice(accounts)
  notice(accounts.balance)
})
