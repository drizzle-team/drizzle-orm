import { numeric, PgError, procedure } from 'drizzle-orm/pg-core'

// Wallet withdrawal with errors a support desk / API error mapper can use:
// values in the message, DETAIL with the numbers, HINT with the remedy.
procedure(
  'withdraw',
  { account: 'bigint', amount: 'numeric', currency: { type: 'text', default: 'EUR' } },
  (ctx) => {
    const { sql, warning } = ctx
    const { account, amount, currency } = ctx.args
    const wallet = sql`SELECT balance, daily_limit FROM wallets WHERE account_id = ${account} AND currency = ${currency} FOR UPDATE`.maybeOne<{
      balance: numeric
      daily_limit: numeric
    }>()
    if (wallet.found) {
      const balance: numeric = wallet.row.balance
      if (balance < amount) {
        throw new PgError('P0001', `insufficient funds on account ${account}`, {
          detail: `balance ${balance} ${currency}, requested ${amount} ${currency}`,
          hint: 'top up the wallet or lower the amount (fees are 2% of the amount)',
        })
      }
      const used: numeric = amount * 100 / wallet.row.daily_limit
      if (used > 100) {
        warning(`withdrawal uses ${used}% of the daily limit on account ${account}`)
      }
      sql`UPDATE wallets SET balance = balance - ${amount} WHERE account_id = ${account} AND currency = ${currency}`
      return { new_balance: balance - amount }
    } else {
      throw new PgError('P0002', `account ${account} has no ${currency} wallet`)
    }
  },
)
