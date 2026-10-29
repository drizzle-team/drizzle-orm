// Building the Effect client from Effect Config, from an existing pool, and with name transforms and json.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { Config, ConfigProvider, Effect, Exit, Layer, String as Str } from 'effect'
import * as Reactivity from 'effect/reactivity/Reactivity'
import { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '../../src/effect/index.ts'
import { TEST_CONFIG, testPool } from '../helpers/db.ts'
import { runTest, testClientConfig } from '../helpers/effect.ts'

const T = `effect_config_${process.pid}`
beforeAll(async () => {
  const pool = testPool()
  await pool.query(`drop table if exists ${T}`)
  await pool.query(`create table ${T} (id serial primary key, first_name text, profile_data jsonb)`)
  await pool.end()
})
afterAll(async () => { const pool = testPool(); await pool.query(`drop table if exists ${T}`); await pool.end() })

describe('DrizzlePostgresClient.layerConfig', () => {
  test('reads a Redacted password and Duration timeouts from a ConfigProvider', async () => {
    const provider = ConfigProvider.fromUnknown({
      PGHOST: TEST_CONFIG.host, PGPORT: String(TEST_CONFIG.port), PGUSER: TEST_CONFIG.user,
      PGPASSWORD: TEST_CONFIG.password, PGDATABASE: TEST_CONFIG.database,
      CONNECT_TIMEOUT: '2 seconds', IDLE_TIMEOUT: '100 millis',
    })
    const layer = DrizzlePostgresClient.layerConfig({
      host: Config.String('PGHOST'), port: Config.Int('PGPORT'), username: Config.String('PGUSER'),
      password: Config.Redacted('PGPASSWORD'), database: Config.String('PGDATABASE'),
      connectTimeout: Config.Duration('CONNECT_TIMEOUT'), idleTimeout: Config.Duration('IDLE_TIMEOUT'),
    }).pipe(Layer.provide(ConfigProvider.layer(provider)))
    const result = await Effect.runPromise(Effect.gen(function* () {
      const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
      const [row] = yield* client<{ n: number }>`select 1 as n`
      const busy = client.pool.size
      yield* Effect.sleep('400 millis')
      return { row, busy, afterIdle: client.pool.size }
    }).pipe(Effect.provide(layer)))
    expect(result).toEqual({ row: { n: 1 }, busy: 1, afterIdle: 0 })
  })
})

describe('ssl', () => {
  test('ssl: true verifies the certificate, so the layer refuses the self-signed test server', async () => {
    const exit = await Effect.runPromise(Effect.exit(Effect.provide(
      Effect.flatMap(Effect.service(SqlClient), (sql) => sql`select 1`),
      DrizzlePostgresClient.layer(testClientConfig({ ssl: true })),
    )))
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

describe('DrizzlePostgresClient.layerFromPool', () => {
  test('shares the pool and leaves it open when the layer scope closes', async () => {
    const pool = testPool()
    try {
      const rows = await Effect.runPromise(Effect.gen(function* () {
        const sql = yield* SqlClient
        return yield* sql<{ n: number }>`select 2 as n`
      }).pipe(Effect.provide(DrizzlePostgresClient.layerFromPool(pool))))
      expect(rows).toEqual([{ n: 2 }])
      const after = await pool.query('select 3')
      expect((after.rows[0] as unknown as number[])[0]).toBe(3)
    } finally { await pool.end() }
  })
})

describe('DrizzlePostgresClient.fromPool', () => {
  test('a pool acquired with acquireRelease ends when the client scope closes', async () => {
    const pool = testPool()
    const acquire = Effect.acquireRelease(Effect.succeed(pool), (p) => Effect.promise(() => p.end()))
    const n = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const client = yield* DrizzlePostgresClient.fromPool({ acquire })
      const [row] = yield* client<{ n: number }>`select 4 as n`
      return row!.n
    })).pipe(Effect.provide(Reactivity.layer)))
    expect(n).toBe(4)
    expect(await pool.query('select 1').then(() => 'ran', (e: unknown) => (e as Error).message)).toBe('pool is closed')
  })
})

describe('transforms and json', () => {
  const transforms = { transformQueryNames: Str.camelToSnake, transformResultNames: Str.snakeToCamel }

  test('camelCase result names and snake_case query names work in a round trip', async () => {
    const rows = await runTest(Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql`insert into ${sql(T)} ${sql.insert({ firstName: 'ada' })}`
      return yield* sql`select ${sql('firstName')} from ${sql(T)} where ${sql('firstName')} = ${'ada'}`
    }), transforms)
    expect(rows).toEqual([{ firstName: 'ada' }])
  })

  test('a json fragment inserts and reads back a nested object', async () => {
    const value = { name: 'ada', tags: ['a', 'b'], nested: { depth: { n: 1 } } }
    const rows = await runTest(Effect.gen(function* () {
      const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
      return yield* client`insert into ${client(T)} (profile_data) values (${client.json(value)}) returning profile_data`
    }))
    expect(rows).toEqual([{ profile_data: value }])
  })

  test('with transforms, json keys are written as snake_case and read back as camelCase', async () => {
    const value = { homeCity: 'Kyiv', pastCities: [{ cityName: 'Lviv' }] }
    const rows = await runTest(Effect.gen(function* () {
      const client = yield* DrizzlePostgresClient.DrizzlePostgresClient
      const [inserted] = yield* client<{ id: number }>`insert into ${client(T)} ${client.insert({ profileData: client.json(value) })} returning id`
      const raw = yield* client.withoutTransforms()`select profile_data from ${client(T)} where id = ${inserted!.id}`
      const read = yield* client`select profile_data from ${client(T)} where id = ${inserted!.id}`
      return { raw, read }
    }), transforms)
    expect(rows.raw).toEqual([{ profile_data: { home_city: 'Kyiv', past_cities: [{ city_name: 'Lviv' }] } }])
    expect(rows.read).toEqual([{ profileData: value }])
  })
})
