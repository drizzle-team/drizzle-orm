// Transactions in the Effect entry point, checked through the rows that end up in the database.
import { test, expect, describe, beforeEach, afterAll } from 'bun:test'
import { Cause, Effect, Exit, Fiber } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '../../src/effect/index.ts'
import { testPool } from '../helpers/db.ts'
import { runTest } from '../helpers/effect.ts'

const T = `effect_tx_${process.pid}`
const ids = async (): Promise<number[]> => {
  const pool = testPool()
  try { return (await pool.query(`select id from ${T} order by id`)).rows.map((r) => (r as unknown as number[])[0]!) }
  finally { await pool.end() }
}
const insert = (id: number) => Effect.gen(function* () { yield* (yield* SqlClient).unsafe(`insert into ${T} values (${id})`) })

beforeEach(async () => {
  const pool = testPool()
  await pool.query(`drop table if exists ${T}`)
  await pool.query(`create table ${T} (id int primary key)`)
  await pool.end()
})
afterAll(async () => { const pool = testPool(); await pool.query(`drop table if exists ${T}`); await pool.end() })

describe('withTransaction', () => {
  test('commits on success', async () => {
    await runTest(Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql.withTransaction(Effect.andThen(insert(1), insert(2)))
    }))
    expect(await ids()).toEqual([1, 2])
  })

  test('rolls back on failure', async () => {
    const exit = await runTest(Effect.exit(Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql.withTransaction(Effect.andThen(insert(1), Effect.fail('boom')))
    })))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(await ids()).toEqual([])
  })

  test('a failing nested transaction rolls back only its savepoint', async () => {
    await runTest(Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql.withTransaction(Effect.gen(function* () {
        yield* insert(1)
        yield* sql.withTransaction(Effect.andThen(insert(2), Effect.fail('inner'))).pipe(Effect.ignore)
        yield* insert(3)
      }))
    }))
    expect(await ids()).toEqual([1, 3])
  })

  test('an interrupt rolls the transaction back', async () => {
    await runTest(Effect.gen(function* () {
      const sql = yield* SqlClient
      const fiber = yield* Effect.forkChild(sql.withTransaction(Effect.andThen(insert(1), Effect.never)))
      yield* Effect.sleep('200 millis')
      yield* Fiber.interrupt(fiber)
    }))
    expect(await ids()).toEqual([])
  })

  test('a transaction that is already aborted fails at COMMIT', async () => {
    const exit = await runTest(Effect.exit(Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql.withTransaction(Effect.gen(function* () {
        yield* insert(1)
        yield* sql`select 1 / 0`.pipe(Effect.ignore)
      }))
    })))
    expect(Exit.isFailure(exit)).toBe(true)
    const failure = Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason) : undefined
    expect(String((failure?.error as Error).message)).toMatch(/COMMIT rolled back/)
    expect(await ids()).toEqual([])
  })

  test('concurrent statements in one transaction run on one backend and see each other\'s writes', async () => {
    const result = await runTest(Effect.gen(function* () {
      const sql = yield* SqlClient
      return yield* sql.withTransaction(Effect.gen(function* () {
        yield* insert(1)
        return yield* Effect.all(
          Array.from({ length: 5 }, () => sql<{ pid: number; n: number }>`select pg_backend_pid() as pid, count(*)::int as n from ${sql(T)}`),
          { concurrency: 'unbounded' },
        )
      }))
    }))
    const rows = result.map((r) => r[0]!)
    expect(new Set(rows.map((r) => r.pid)).size).toBe(1)
    expect(rows.every((r) => r.n === 1)).toBe(true)
  })
})

describe('DrizzlePostgresClient.withTransaction options', () => {
  const settings = Effect.gen(function* () {
    const sql = yield* SqlClient
    const [row] = yield* sql<{ isolation: string; readOnly: string; deferrable: string }>`select
      current_setting('transaction_isolation') as isolation,
      current_setting('transaction_read_only') as "readOnly",
      current_setting('transaction_deferrable') as deferrable`
    return row!
  })

  test('isolation, readOnly and deferrable change the server settings of the outermost transaction', async () => {
    const got = await runTest(Effect.gen(function* () {
      const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
      return yield* client.withTransaction(settings, { isolation: 'serializable', readOnly: true, deferrable: true })
    }))
    expect(got).toEqual({ isolation: 'serializable', readOnly: 'on', deferrable: 'on' })
  })

  test('a nested call ignores its options', async () => {
    const got = await runTest(Effect.gen(function* () {
      const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
      return yield* client.withTransaction(
        client.withTransaction(settings, { isolation: 'serializable', readOnly: true }),
        { isolation: 'repeatable read' },
      )
    }))
    expect(got).toEqual({ isolation: 'repeatable read', readOnly: 'off', deferrable: 'off' })
  })
})
