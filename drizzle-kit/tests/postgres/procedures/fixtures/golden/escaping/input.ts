import { PgError, procedure, text } from 'drizzle-orm/pg-core'

procedure('report_progress', { pct: 'int' }, (ctx) => {
  const { notice } = ctx
  const { pct } = ctx.args
  if (pct > 100) {
    throw new PgError('P0001', "can't exceed 100%")
  }
  const status: text = "it's going well"
  notice("50% done, don't stop")
  notice(status)
})
