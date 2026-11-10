import { procedure } from 'drizzle-orm/pg-core'

// 'bigint' params are number-mode (plain literals); 'bigint64' opts into
// TS-side bigint (0n literals). Both emit the same SQL type.
procedure('bigint_modes', { seq: 'bigint64', account: 'bigint' }, (ctx) => {
  const { sql, notice } = ctx
  const { seq, account } = ctx.args
  if (seq === 0n) {
    notice('fresh sequence')
  }
  const touched = sql`UPDATE accounts SET seq = ${seq} WHERE id = ${account}`
  if (touched.count === 0) {
    notice('no such account')
  }
})
