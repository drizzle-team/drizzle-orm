import type { bigint_ } from 'drizzle-orm/pg-core'
import { tenant } from '../../../schema'

// The schema binding may come from the drizzle schema module.
export const bump = tenant.procedure('bump', { id: 'bigint' }, (ctx) => {
  const { args, sql } = ctx
  const row = sql`SELECT count(*) AS n FROM counters WHERE id = ${args.id}`.one<{ n: bigint_ }>()
  return { n: row.n }
})
