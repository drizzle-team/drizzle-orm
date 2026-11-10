import { procedure } from 'drizzle-orm/pg-core'

procedure('bad_commit', { id: 'bigint' }, (ctx) => {
  const { commit } = ctx
  commit(true)
  const ok: boolean = ctx.rollback()
  const c = commit
})
