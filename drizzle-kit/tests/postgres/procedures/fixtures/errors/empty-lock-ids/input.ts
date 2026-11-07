import { procedure } from 'drizzle-orm/pg-core'

procedure('settle_day', {}, (ctx) => {
  const { lockRowsOrdered } = ctx
  lockRowsOrdered('accounts', [])
})
