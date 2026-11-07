import { procedure as proc, PgError as DbError } from 'drizzle-orm/pg-core'

// The compiler resolves DSL primitives by symbol, not identifier text:
// aliased imports of procedure/PgError must compile identically.
proc('close_account', { account: 'bigint' }, (ctx) => {
  const { sql } = ctx
  const { account } = ctx.args
  const closed = sql`UPDATE accounts SET closed = true WHERE id = ${account}`
  if (closed.count === 0) {
    throw new DbError('P0002', 'no such account')
  }
})
