import { bigint_, procedure } from 'drizzle-orm/pg-core'

// Booking hold: reserve a slot for `minutes` (default 15). An optional
// promo code (default null → nullable) is recorded only when given.
// Defaults + a return record → OUT parameters are emitted first.
procedure(
  'hold_slot',
  {
    slot: 'bigint',
    guest: 'bigint',
    minutes: { type: 'int', default: 15 },
    promo: { type: 'text', default: null },
  },
  (ctx) => {
    const { sql, isNull } = ctx
    const { slot, guest, minutes, promo } = ctx.args
    const hold = sql`INSERT INTO holds (slot_id, guest_id, expires_at) VALUES (${slot}, ${guest}, now() + make_interval(mins => ${minutes})) RETURNING id`.one<{
      id: bigint_
    }>()
    const hold_id: bigint_ = hold.id
    if (!isNull(promo)) {
      sql`UPDATE holds SET promo_code = ${promo} WHERE id = ${hold_id}`
    }
    return { hold_id: hold_id }
  },
)

// Housekeeping job: every parameter has a default, so `CALL expire_holds()`
// works. No return record → parameter order is unchanged.
procedure(
  'expire_holds',
  { grace_minutes: { type: 'int', default: 0 }, dry_run: { type: 'boolean', default: false } },
  (ctx) => {
    const { sql, notice, rollback } = ctx
    const { grace_minutes, dry_run } = ctx.args
    const expired = sql`DELETE FROM holds WHERE expires_at < now() - make_interval(mins => ${grace_minutes})`
    notice(`expired ${expired.count} holds`)
    if (dry_run) {
      rollback()
    }
  },
)
