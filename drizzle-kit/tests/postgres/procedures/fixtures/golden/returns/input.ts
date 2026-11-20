import { numeric, procedure } from 'drizzle-orm/pg-core'
import { accounts } from '../../../schema'

// `return { ... }` compiles to OUT parameters (CALL yields one row of
// them); the shape is inferred from the return sites and unified across
// them — numeric family widens (integer 0 ∪ numeric balance → numeric).
procedure('apply_fee', { account: 'bigint', fee: 'numeric' }, (ctx) => {
  const { args, sql } = ctx
  const hit = sql`UPDATE ${accounts} SET ${accounts.balance} = ${accounts.balance} - ${args.fee} WHERE ${accounts.id} = ${args.account} AND ${accounts.balance} >= ${args.fee}`
  if (hit.count === 0) {
    return { status: 'skipped', charged: 0 }
  }
  const row = sql`SELECT ${accounts.balance} FROM ${accounts} WHERE ${accounts.id} = ${args.account}`.one<{
    balance: numeric
  }>()
  return { status: 'charged', charged: row.balance }
})
