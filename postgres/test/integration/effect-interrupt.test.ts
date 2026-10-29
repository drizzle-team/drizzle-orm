// Interrupting a statement in the Effect entry point cancels it on the server and keeps the pool healthy.
import { test, expect, describe } from 'bun:test'
import { Effect, Exit, Fiber } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { testPool } from '../helpers/db.ts'
import { runTest } from '../helpers/effect.ts'

const activeQueries = async (applicationName: string): Promise<number> => {
  const pool = testPool()
  try {
    const r = await pool.query("select count(*)::int from pg_stat_activity where application_name = $1 and state = 'active'", [applicationName])
    return (r.rows[0] as unknown as number[])[0]!
  } finally { await pool.end() }
}

describe('interrupting a statement', () => {
  test('a timed-out pg_sleep is canceled on the server, ends as interrupted, and the pool serves the next statement', async () => {
    const applicationName = `effect_interrupt_${process.pid}`
    const result = await runTest(Effect.gen(function* () {
      const sql = yield* SqlClient
      const fiber = yield* Effect.forkChild(sql`select pg_sleep(5)`)
      yield* Effect.sleep('200 millis')
      const exit = yield* Fiber.interrupt(fiber).pipe(Effect.andThen(Fiber.await(fiber)))
      let active = 1
      for (let i = 0; i < 40 && active > 0; i++) {
        yield* Effect.sleep('50 millis')
        active = yield* Effect.promise(() => activeQueries(applicationName))
      }
      const [next] = yield* sql<{ n: number }>`select 7 as n`
      return { exit, active, next }
    }), { applicationName })
    expect(Exit.isFailure(result.exit) && Exit.hasInterrupts(result.exit)).toBe(true)
    expect(Exit.isFailure(result.exit) && Exit.hasFails(result.exit)).toBe(false)
    expect(result.active).toBe(0)
    expect(result.next).toEqual({ n: 7 })
  }, 10000)

  test('Effect.timeout around a long statement returns quickly', async () => {
    const t0 = Date.now()
    const exit = await runTest(Effect.exit(Effect.gen(function* () {
      const sql = yield* SqlClient
      return yield* sql`select pg_sleep(5)`.pipe(Effect.timeout('100 millis'))
    })))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(Date.now() - t0).toBeLessThan(2000)
  }, 10000)

  test('a fiber interrupted while it waits for a connection does not leak that connection', async () => {
    const rows = await runTest(Effect.gen(function* () {
      const sql = yield* SqlClient
      const holder = yield* Effect.forkChild(sql`select pg_sleep(0.3)`)
      yield* Effect.sleep('50 millis')
      const waiter = yield* Effect.forkChild(sql`select 1`)
      yield* Effect.sleep('50 millis')
      yield* Fiber.interrupt(waiter)
      yield* Fiber.join(holder)
      return yield* sql<{ n: number }>`select 2 as n`.pipe(Effect.timeout('2 seconds'))
    }), { maxConnections: 1 })
    expect(rows).toEqual([{ n: 2 }])
  }, 10000)
})
