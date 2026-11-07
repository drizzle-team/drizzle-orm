import { int, procedure, text } from 'drizzle-orm/pg-core'

procedure('greet_owner', { name: 'text' }, (ctx) => {
  const { notice } = ctx
  const { name } = ctx.args
  const greeting: text = 'hello ' + name
  notice(greeting)
})

procedure('reset_score', { player: 'int', base: 'int' }, (ctx) => {
  const { sql, notice } = ctx
  const { player, base } = ctx.args
  const next: int = base + 1
  sql`UPDATE scores SET score = ${next} WHERE player_id = ${player}`
  notice(next)
})
