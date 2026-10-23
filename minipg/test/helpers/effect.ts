// Runs Effects against the local cluster through the MinipgClient layer.
import { Effect, Redacted } from 'effect'
import type { SqlClient } from 'effect/sql/SqlClient'
import { MinipgClient } from '../../src/effect/index.ts'
import { TEST_CONFIG, VARIANT } from './db.ts'

export const testClientConfig = (o: Partial<MinipgClient.MinipgClientConfig> = {}): MinipgClient.MinipgClientConfig => ({
  host: TEST_CONFIG.host,
  port: TEST_CONFIG.port,
  username: TEST_CONFIG.user,
  password: Redacted.make(TEST_CONFIG.password ?? ''),
  database: TEST_CONFIG.database,
  decode: VARIANT,
  ...o,
})

export const testLayer = (o: Partial<MinipgClient.MinipgClientConfig> = {}) => MinipgClient.layer(testClientConfig(o))

/** Provides a fresh layer, runs the Effect, and closes the layer's pool afterwards. */
export const runTest = <A, E>(
  effect: Effect.Effect<A, E, MinipgClient.MinipgClient | SqlClient>,
  o: Partial<MinipgClient.MinipgClientConfig> = {},
): Promise<A> => Effect.runPromise(Effect.provide(effect, testLayer(o)))
