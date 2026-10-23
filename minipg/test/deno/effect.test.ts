// `@drizzle-team/minipg/effect/deno` under real Deno: its layer must dial through Deno.connect.
//
// Run with: deno test --no-check --allow-net --allow-env --allow-read --allow-sys test/deno/effect.test.ts
import { assertEquals } from 'jsr:@std/assert@1'
import { Buffer } from 'node:buffer'
;(globalThis as { Buffer?: unknown }).Buffer ??= Buffer
import { Effect, Redacted } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { MinipgClient } from '../../src/effect/deno.ts'

const HOST = Deno.env.get('PGTEST_HOST') ?? '127.0.0.1'
const PORT = Number(Deno.env.get('PGTEST_PORT') ?? 54329)

Deno.test('the ./effect/deno layer includes its transport and runs a sql select', async () => {
  const layer = MinipgClient.layer({ host: HOST, port: PORT, database: 'testdb', username: 'postgres', password: Redacted.make('postgres') })
  const rows = await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient
    return yield* sql<{ n: number }>`select 1 as n`
  }).pipe(Effect.provide(layer)))
  assertEquals(rows, [{ n: 1 }])
})
