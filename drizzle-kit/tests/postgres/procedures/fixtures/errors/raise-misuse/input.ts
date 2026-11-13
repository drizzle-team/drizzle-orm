import { PgError, procedure, text } from 'drizzle-orm/pg-core'

procedure('refund', { charge: 'bigint' }, (ctx) => {
  const { notice } = ctx
  const { charge } = ctx.args
  const reason: text = 'duplicate'
  if (charge > 0) {
    throw new PgError('P0001', reason)
  }
  if (charge > 1) {
    throw new PgError('P0001', 'bad charge', 'no detail')
  }
  if (charge > 2) {
    throw new PgError('P0001', 'bad charge', { code: 'x' })
  }
  notice(`line one\nline two ${charge}`)
})
