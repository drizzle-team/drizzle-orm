import { int, procedure } from 'drizzle-orm/pg-core'

procedure('flagMissing', { balance: 'int' }, (ctx) => {
  const { notice } = ctx
  const { balance } = ctx.args
  if (balance === null) {
    notice('missing balance')
  }
})
