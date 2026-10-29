// The Effect entry point against the local cluster: statements through SqlClient, spans, and the layer's pool.
import { test, expect, describe } from 'bun:test'
import { Context, Effect, Exit, Layer, Redacted, Tracer } from 'effect'
import { SqlClient } from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'
import { DrizzlePostgresClient } from '../../src/effect/index.ts'
import { testPool } from '../helpers/db.ts'
import { runTest, testLayer } from '../helpers/effect.ts'

const SELECT = 'select id, name, n8, amount, ok, data from t order by id'

describe('DrizzlePostgresClient layer', () => {
  test('select, .values, .unprepared and .raw return what the async entry point returns', async () => {
    const pool = testPool()
    try {
      const objects = (await pool.query(SELECT, [], { mode: 'object' })).rows
      const arrays = (await pool.query(SELECT)).rows
      const got = await runTest(Effect.gen(function* () {
        const sql = yield* SqlClient
        const q = () => sql.unsafe(SELECT)
        return {
          rows: yield* q(),
          values: yield* q().values,
          unprepared: yield* q().unprepared,
          raw: (yield* q().raw) as { rows: unknown[]; command: string; rowCount: number; columns: string[] },
        }
      }))
      expect(got.rows).toEqual(objects)
      expect(got.values).toEqual(arrays)
      expect(got.unprepared).toEqual(objects)
      expect(got.raw.rows).toEqual(objects)
      expect(got.raw.command).toBe('SELECT')
      expect(got.raw.rowCount).toBe(3)
      expect(got.raw.columns).toEqual(['id', 'name', 'n8', 'amount', 'ok', 'data'])
    } finally { await pool.end() }
  })

  test('template parameters bind as $n placeholders', async () => {
    const rows = await runTest(Effect.gen(function* () {
      const sql = yield* SqlClient
      return yield* sql<{ name: string }>`select name from ${sql('t')} where id = ${2}`
    }))
    expect(rows).toEqual([{ name: 'bob' }])
  })

  test('SQL with several statements fails with a clear error', async () => {
    const exit = await runTest(Effect.exit(Effect.gen(function* () {
      const sql = yield* SqlClient
      return yield* sql`select 1; select 2`
    })))
    expect(Exit.isFailure(exit)).toBe(true)
    const err = (exit as Exit.Failure<unknown, SqlError>).cause.reasons[0] as unknown as { error: SqlError }
    expect(err.error.reason._tag).toBe('SqlSyntaxError')
    expect(err.error.message).toMatch(/several statements is not supported/)
  })

  test('each statement gets one span with the database attributes', async () => {
    const spans: Tracer.NativeSpan[] = []
    const tracer = Tracer.make({ span(options) { const s = new Tracer.NativeSpan(options); spans.push(s); return s } })
    await runTest(Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql`select 1`
      yield* sql`select 2`
    }).pipe(Effect.withTracer(tracer)))
    const statements = spans.filter((s) => s.attributes.get('db.query.text') !== undefined)
    expect(statements.length).toBe(2)
    for (const s of statements) {
      expect(s.kind).toBe('client')
      expect(s.attributes.get('db.system.name')).toBe('postgresql')
      expect(s.attributes.get('db.namespace')).toBe('testdb')
      expect(s.attributes.get('server.address')).toBe('127.0.0.1')
      expect(s.attributes.get('server.port')).toBe(54329)
      expect(s.attributes.get('driver')).toBe('drizzle-postgres')
    }
  })

  test('building the layer connects, and closing its scope ends the pool', async () => {
    const pool = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const context = yield* Layer.build(testLayer())
      const client = Context.get(context, DrizzlePostgresClient.DrizzlePostgresClient)
      expect(client.pool.size).toBe(1)
      return client.pool
    })))
    expect(pool.size).toBe(0)
    expect(await pool.query('select 1').then(() => 'ran', (e: unknown) => (e as Error).message)).toBe('pool is closed')
  })

  test('a layer with a wrong password fails to build with an AuthenticationError', async () => {
    const exit = await Effect.runPromiseExit(Effect.scoped(Layer.build(testLayer({ password: Redacted.make('wrong') }))))
    expect(Exit.isFailure(exit)).toBe(true)
    const err = (exit as Exit.Failure<unknown, SqlError>).cause.reasons[0] as unknown as { error: SqlError }
    expect(err.error.reason._tag).toBe('AuthenticationError')
  })
})
