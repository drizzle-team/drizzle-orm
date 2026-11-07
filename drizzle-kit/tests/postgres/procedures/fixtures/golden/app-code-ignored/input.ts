import { type PgAsyncDatabase, procedure } from 'drizzle-orm/pg-core'
import { accounts } from '../../../schema'

// Ordinary application code around procedure() scopes is ignored by the
// compiler — only the procedure bodies are whitelisted and compiled.
const auditNote = 'reviewed by compliance'
export function appHelper(): string {
  return auditNote.toUpperCase()
}

export const mark_reviewed = procedure('mark_reviewed', { account: 'bigint' }, (ctx) => {
  const { args, sql } = ctx
  sql`UPDATE ${accounts} SET ${accounts.reviewed} = true WHERE ${accounts.id} = ${args.account}`
})

export const summary = appHelper()
export const markReviewed = (db: PgAsyncDatabase<any>) => db.call(mark_reviewed, { account: 1 })
