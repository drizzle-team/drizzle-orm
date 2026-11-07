import { numeric, procedure } from 'drizzle-orm/pg-core'

procedure('drift', { start: 'numeric' }, (ctx) => {
  const { sql, notice } = ctx
  let threshold: numeric = ctx.args.start
  const rows = sql`SELECT id FROM holds WHERE amount > ${threshold}`.many()
  threshold = threshold + 1
  for (const row of rows) {
    notice('hold')
  }
})
