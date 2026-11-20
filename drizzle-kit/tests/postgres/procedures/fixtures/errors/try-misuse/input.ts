import { int, procedure } from 'drizzle-orm/pg-core'

procedure('try_misuse', { n: 'int' }, (ctx) => {
  const { sql, commit } = ctx
  let total: int = 0
  const { res, err } = ctx.try(() => {
    sql`UPDATE t SET x = 1`
    commit()
    total = 1
    if (total > 0) {
      return { v: total }
    }
    return { v: 2 }
  }, ['unique_violation'])
  const early: int = res.v
  ctx.notice(err.message)
  while (total < 3) {
    ctx.try(() => {
      break
    }, ['unique_violation'])
    total = total + 1
  }
  ctx.try(() => {}, [])
  ctx.try(() => {}, ['others', 'not_a_condition', '01000', 'P0409', 'P0409'])
  const r = ctx.try(() => {}, ['unique_violation'])
})
