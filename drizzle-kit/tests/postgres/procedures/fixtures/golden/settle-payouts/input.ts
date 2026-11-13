import { bigint_, int, numeric, procedure } from 'drizzle-orm/pg-core'

// Nightly payout settlement: drains the pending queue, committing every
// `batchSize` payouts so a failure loses at most one batch and row locks
// are released as it goes. Held merchants are parked and skipped.
procedure('settle_payouts', { batch_size: 'int', max_payouts: 'int' }, (ctx) => {
  const { sql, commit } = ctx
  const { batch_size, max_payouts } = ctx.args
  let processed: int = 0
  let in_batch: int = 0
  while (processed < max_payouts) {
    const next = sql`SELECT id, merchant_id, amount FROM payouts WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`.maybeOne<{
      id: bigint_
      merchant_id: bigint_
      amount: numeric
    }>()
    if (next.found) {
      const payout_id: bigint_ = next.row.id
      const merchant_id: bigint_ = next.row.merchant_id
      const amount: numeric = next.row.amount
      const parked = sql`UPDATE payouts SET status = 'held' WHERE id = ${payout_id} AND EXISTS (SELECT 1 FROM merchant_holds h WHERE h.merchant_id = ${merchant_id})`
      if (parked.found) {
        continue
      }
      sql`UPDATE merchants SET balance = balance - ${amount} WHERE id = ${merchant_id}`
      sql`UPDATE payouts SET status = 'paid' WHERE id = ${payout_id}`
      processed = processed + 1
      in_batch = in_batch + 1
      if (in_batch >= batch_size) {
        commit()
        in_batch = 0
      }
    } else {
      break
    }
  }
  return { processed: processed }
})
