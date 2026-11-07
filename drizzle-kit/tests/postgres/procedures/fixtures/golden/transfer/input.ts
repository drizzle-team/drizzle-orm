import { PgError, procedure } from 'drizzle-orm/pg-core'

procedure(
  'transfer',
  { from: 'bigint', to: 'bigint', amount: 'numeric' },
  (ctx) => {
    const { sql, lockRowsOrdered } = ctx
    const { from, to, amount } = ctx.args
    lockRowsOrdered('accounts', [from, to])

    const debit = sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${from} AND balance >= ${amount}`
    if (debit.count === 0) {
      throw new PgError('P0001', 'insufficient funds')
    }

    sql`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${to}`
    sql`INSERT INTO ledger (from_account, to_account, amount) VALUES (${from}, ${to}, ${amount})`
  },
)
