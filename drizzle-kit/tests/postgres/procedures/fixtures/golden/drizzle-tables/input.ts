import { PgError, procedure, text } from 'drizzle-orm/pg-core'
import { accounts, ledger } from '../../../schema'

// Drizzle tables/columns interpolate as quoted, rename-safe identifiers:
// ${accounts} → "accounts", ${accounts.ownerName} → "owner_name".
procedure('drizzle_transfer', { from: 'bigint', to: 'bigint', amount: 'numeric' }, (ctx) => {
  const { args, sql, notice } = ctx

  const owner = sql`SELECT ${accounts.ownerName} FROM ${accounts} WHERE ${accounts.id} = ${args.from}`.maybeOne<{
    owner_name: text | null
  }>()
  if (owner.found) {
    notice('transfer from named account')
  }

  const debit = sql`UPDATE ${accounts} SET ${accounts.balance} = ${accounts.balance} - ${args.amount} WHERE ${accounts.id} = ${args.from} AND ${accounts.balance} >= ${args.amount}`
  if (debit.count === 0) {
    throw new PgError('P0001', 'insufficient funds')
  }

  sql`UPDATE ${accounts} SET ${accounts.balance} = ${accounts.balance} + ${args.amount} WHERE ${accounts.id} = ${args.to}`
  sql`INSERT INTO ${ledger} (${ledger.fromAccount}, ${ledger.toAccount}, ${ledger.amount}) VALUES (${args.from}, ${args.to}, ${args.amount})`
})
