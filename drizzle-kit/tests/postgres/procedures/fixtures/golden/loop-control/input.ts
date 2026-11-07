import { bigint_, procedure } from 'drizzle-orm/pg-core'

// Booking: first bookable slot of a room on a day — skip blocked/taken
// slots (continue), stop at the first free one (break).
procedure('first_free_slot', { room: 'bigint', day: 'text' }, (ctx) => {
  const { sql } = ctx
  const { room, day } = ctx.args
  let free: bigint_ | null = null
  for (const slot of sql`SELECT id, blocked FROM slots WHERE room_id = ${room} AND day = ${day}::date ORDER BY starts_at`.many<{
    id: bigint_
    blocked: boolean
  }>()) {
    if (slot.blocked) {
      continue
    }
    const slot_id: bigint_ = slot.id
    const taken = sql`SELECT count(*) AS n FROM bookings WHERE slot_id = ${slot_id}`.one<{ n: bigint_ }>()
    if (taken.n > 0) {
      continue
    }
    free = slot_id
    break
  }
  return { slot: free }
})

// Dry run: apply a price change, report how many bookings it touches,
// then discard it.
procedure('preview_reprice', { room: 'bigint', price: 'numeric' }, (ctx) => {
  const { sql, rollback } = ctx
  const { room, price } = ctx.args
  const touched = sql`UPDATE bookings SET price = ${price} WHERE room_id = ${room} AND status = 'pending'`
  rollback()
  return { affected: touched.count }
})
