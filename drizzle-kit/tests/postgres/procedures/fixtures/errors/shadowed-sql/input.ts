import { procedure } from 'drizzle-orm/pg-core'
import type { text } from 'drizzle-orm/pg-core'

procedure('shadowed', { id: 'text' }, (ctx) => {
  const sql: text = 'x'
  sql`SELECT 1`
})
