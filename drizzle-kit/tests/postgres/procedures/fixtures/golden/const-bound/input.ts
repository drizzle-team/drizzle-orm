import { procedure } from 'drizzle-orm/pg-core'

// The const binding name is ignored — the string literal names the
// procedure, so this emits CREATE OR REPLACE PROCEDURE actual_name.
export const somethingElse = procedure('actual_name', { account: 'bigint' }, (ctx) => {
  ctx.notice(ctx.args.account)
})
