// Runs Effects against the local cluster through the DrizzlePostgresClient layer.
import { Effect, Redacted } from 'effect'
import type { SqlClient } from 'effect/sql/SqlClient'
import { DrizzlePostgresClient } from '../../src/effect/index.ts'
import { TEST_CONFIG, VARIANT } from './db.ts'

export const testClientConfig = (o: Partial<DrizzlePostgresClient.DrizzlePostgresClientConfig> = {}): DrizzlePostgresClient.DrizzlePostgresClientConfig => ({
  host: TEST_CONFIG.host,
  port: TEST_CONFIG.port,
  username: TEST_CONFIG.user,
  password: Redacted.make(TEST_CONFIG.password ?? ''),
  database: TEST_CONFIG.database,
  decode: VARIANT,
  ...o,
})

export const testLayer = (o: Partial<DrizzlePostgresClient.DrizzlePostgresClientConfig> = {}) => DrizzlePostgresClient.layer(testClientConfig(o))

/** Provides a fresh layer, runs the Effect, and closes the layer's pool afterwards. */
export const runTest = <A, E>(
  effect: Effect.Effect<A, E, DrizzlePostgresClient.DrizzlePostgresClient | SqlClient>,
  o: Partial<DrizzlePostgresClient.DrizzlePostgresClientConfig> = {},
): Promise<A> => Effect.runPromise(Effect.provide(effect, testLayer(o)))
