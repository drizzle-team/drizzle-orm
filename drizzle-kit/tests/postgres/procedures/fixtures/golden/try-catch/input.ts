import { bigint_, int, PgError, procedure, text } from 'drizzle-orm/pg-core'

// Book a slot. A retried request (same idempotency key → unique_violation)
// returns the existing booking; a full slot (our own P0409, raised inside
// the try) is re-raised with context. The failed attempt's writes are
// rolled back by the exception block.
procedure('book_slot', { slot: 'bigint', guest: 'bigint', idem_key: 'text' }, (ctx) => {
  const { sql } = ctx
  const { slot, guest, idem_key } = ctx.args
  const { res, err } = ctx.try(() => {
    const s = sql`SELECT capacity, booked FROM slots WHERE id = ${slot} FOR UPDATE`.one<{ capacity: int; booked: int }>()
    if (s.booked >= s.capacity) {
      throw new PgError('P0409', `slot ${slot} is full`)
    }
    sql`UPDATE slots SET booked = booked + 1 WHERE id = ${slot}`
    const b = sql`INSERT INTO bookings (slot_id, guest_id, idem_key) VALUES (${slot}, ${guest}, ${idem_key}) RETURNING id`.one<{ id: bigint_ }>()
    return { id: b.id }
  }, ['unique_violation', 'P0409'])
  if (err !== null) {
    if (err.code === 'unique_violation') {
      const existing = sql`SELECT id FROM bookings WHERE idem_key = ${idem_key}`.one<{ id: bigint_ }>()
      return { booking: existing.id, status: 'duplicate' }
    }
    throw new PgError('P0409', `cannot book slot ${slot}`, { detail: err.message })
  }
  return { booking: res.id, status: 'created' }
})

// Bulk import: skip guests that already exist, count them, and mark the
// batch done if nothing else is holding it (statement form, no bindings).
procedure('import_guests', { batch: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { batch } = ctx.args
  let skipped: int = 0
  for (const g of sql`SELECT email, name FROM guest_imports WHERE batch_id = ${batch} ORDER BY email`.many<{ email: text; name: text }>()) {
    const email: text = g.email
    const name: text = g.name
    const { err } = ctx.try(() => {
      sql`INSERT INTO guests (email, name) VALUES (${email}, ${name})`
    }, ['unique_violation'])
    if (err !== null) {
      skipped = skipped + 1
      continue
    }
  }
  ctx.try(() => {
    sql`UPDATE import_batches SET done = true WHERE id = ${batch}`
  }, ['lock_not_available'])
  return { skipped: skipped }
})
