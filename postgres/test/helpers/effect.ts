// Runs Effects against the local cluster through the DrizzlePostgresClient layer.
import { Effect, Redacted } from 'effect';
import type { SqlClient } from 'effect/sql/SqlClient';
import { DrizzlePostgresClient } from '../../src/effect/index.ts';
import * as PGliteClient from '../../src/effect/pglite-client.ts';
import { borrowPGlite, PGLITE, TEST_CONFIG, VARIANT } from './db.ts';

export const testClientConfig = (
	o: Partial<DrizzlePostgresClient.DrizzlePostgresClientConfig> = {},
): DrizzlePostgresClient.DrizzlePostgresClientConfig => ({
	host: TEST_CONFIG.host,
	port: TEST_CONFIG.port,
	username: TEST_CONFIG.user,
	password: Redacted.make(TEST_CONFIG.password ?? ''),
	database: TEST_CONFIG.database,
	decode: VARIANT,
	...o,
});

export const testLayer = (o: Partial<DrizzlePostgresClient.DrizzlePostgresClientConfig> = {}) =>
	DrizzlePostgresClient.layer(testClientConfig(o));

// The settings that name a server or size its pool: a PGlite has none, and its pool has one connection.
const SERVER_ONLY = ['url', 'host', 'port', 'path', 'ssl', 'username', 'password', 'database', 'maxConnections'];

/** Provides a fresh layer, runs the Effect, and closes the layer's pool afterwards. In a PGlite run
 *  (DRIZZLE_POSTGRES_TEST_TRANSPORT=pglite) the layer is the PGlite client's, over a PGlite borrowed for the run. */
export const runTest = async <A, E>(
	effect: Effect.Effect<A, E, DrizzlePostgresClient.DrizzlePostgresClient | SqlClient>,
	o: Partial<DrizzlePostgresClient.DrizzlePostgresClientConfig> = {},
): Promise<A> => {
	if (!PGLITE) return Effect.runPromise(Effect.provide(effect, testLayer(o)));
	const [pg, giveBack] = borrowPGlite();
	try {
		const config = Object.fromEntries(
			Object.entries({ decode: VARIANT, ...o }).filter(([key]) => !SERVER_ONLY.includes(key)),
		) as PGliteClient.PGliteClientConfig;
		return await Effect.runPromise(Effect.provide(effect, PGliteClient.layer(pg, config)));
	} finally {
		giveBack();
	}
};
