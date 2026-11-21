import { pgSchema } from 'drizzle-orm/pg-core'

const billing = pgSchema('billing')

billing.procedure('close_period', { period: 'int' }, ({ sql }) => {
  sql`SELECT 1`
})

billing.procedure('Close_Period', { period: 'int' }, ({ sql }) => {
  sql`SELECT 2`
})
