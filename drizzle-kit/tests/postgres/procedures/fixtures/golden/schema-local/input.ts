import { pgSchema, procedure } from 'drizzle-orm/pg-core'

// A procedure on a pgSchema binding is created in that schema; names are
// unique per schema, so the same name may also exist in public.
const billing = pgSchema('billing')

export const close = billing.procedure('close_period', { period: 'int' }, ({ args, sql }) => {
  sql`UPDATE periods SET closed = true WHERE id = ${args.period}`
})

export const closePublic = procedure('close_period', { period: 'int' }, ({ args, sql }) => {
  sql`UPDATE periods SET archived = true WHERE id = ${args.period}`
})

export const reopen = pgSchema('audit').procedure('reopen_period', { period: 'int' }, ({ args, sql }) => {
  sql`UPDATE periods SET closed = false WHERE id = ${args.period}`
})
