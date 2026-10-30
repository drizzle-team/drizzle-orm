// Bulk writes as Effects: bulkInsert, bulkUpdate and copyMany.
import { test, expect, describe, beforeEach, afterAll } from 'bun:test'
import { Cause, Effect, Exit, Fiber } from 'effect'
import { DrizzlePostgresClient } from '../../src/effect/index.ts'
import { testPool } from '../helpers/db.ts'
import { runTest } from '../helpers/effect.ts'

const T = `effect_bulk_${process.pid}`
const COLUMNS = { id: 'int4', name: 'text' } as const
const rows = async (): Promise<unknown[]> => {
  const pool = testPool()
  try { return (await pool.query(`select id, name from ${T} order by id`)).rows }
  finally { await pool.end() }
}
beforeEach(async () => {
  const pool = testPool()
  await pool.query(`drop table if exists ${T}`)
  await pool.query(`create table ${T} (id int primary key, name text)`)
  await pool.end()
})
afterAll(async () => { const pool = testPool(); await pool.query(`drop table if exists ${T}`); await pool.end() })

describe('bulk writes', () => {
  test('bulkInsert, bulkUpdate and copyMany write the expected rows', async () => {
    const results = await runTest(Effect.gen(function* () {
      const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
      const inserted = yield* client.bulkInsert(T, COLUMNS, [[1, 'a'], [2, 'b']])
      const copied = yield* client.copyMany(T, COLUMNS, [[3, 'c'], [4, 'd']])
      const updated = yield* client.bulkUpdate(T, COLUMNS, [{ id: 1, name: 'A' }, { id: 3, name: 'C' }], { by: 'id' })
      return [inserted.rowCount, copied.rowCount, updated.rowCount]
    }))
    expect(results).toEqual([2, 2, 2])
    expect(await rows()).toEqual([[1, 'A'], [2, 'b'], [3, 'C'], [4, 'd']])
  })

  test('inside a transaction that rolls back, none of their rows remain', async () => {
    await runTest(Effect.gen(function* () {
      const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
      yield* client.withTransaction(Effect.gen(function* () {
        yield* client.bulkInsert(T, COLUMNS, Array.from({ length: 200 }, (_, i) => [i, `n${i}`]))
        yield* client.copyMany(T, COLUMNS, [[1000, 'x']])
        yield* Effect.fail('rollback')
      })).pipe(Effect.ignore)
    }))
    expect(await rows()).toEqual([])
  })

  test('errors are SqlErrors', async () => {
    const exit = await runTest(Effect.exit(Effect.gen(function* () {
      const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
      return yield* client.bulkInsert(T, COLUMNS, [[1, 'a'], [1, 'b']])
    })))
    const reason = Exit.isFailure(exit) ? (exit.cause.reasons.find(Cause.isFailReason)?.error as { reason: { _tag: string } }).reason._tag : undefined
    expect(reason).toBe('UniqueViolation')
  })

  test('an interrupt returns the connection to the pool', async () => {
    const holder = testPool()
    const { client: lock, release } = await holder.connect()
    try {
      await lock.query('begin')
      await lock.query(`lock table ${T}`)
      const next = await runTest(Effect.gen(function* () {
        const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
        const blocked = yield* Effect.forkChild(client.bulkInsert(T, COLUMNS, [[1, 'a']]))
        yield* Effect.sleep('200 millis')
        yield* Fiber.interrupt(blocked)
        return (yield* client.query('select 1')).rows
      }).pipe(Effect.timeout('3 seconds')), { maxConnections: 1 })
      expect(next).toEqual([[1]])
    } finally { await lock.query('rollback'); release(); await holder.end() }
    expect(await rows()).toEqual([])
  }, 10000)
})
