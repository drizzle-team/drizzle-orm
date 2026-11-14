// The DrizzlePostgresClient namespace for an in-process PGlite. Its make, layer and layerConfig create the pool with
// @drizzle-team/postgres/pglite: one connection, which every statement shares, and which ends PGlite's session
// when it closes. The PGlite instance stays the caller's: closing the layer leaves it open.
import * as Config from 'effect/Config';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import { createPool, type PGliteLike } from '../pglite.ts';
import { type DrizzlePostgresClientConfig, layerFrom } from './DrizzlePostgresClient.ts';
import { makeWithOwnPool } from './owned-pool.ts';

export * from './DrizzlePostgresClient.ts';
export type { PGliteLike };

/** The DrizzlePostgresClientConfig settings that apply to PGlite: a server's connection settings don't, and PGlite
 *  runs one session, so the pool has one connection. */
export interface PGliteClientConfig extends
	Pick<
		DrizzlePostgresClientConfig,
		| 'idleTimeout'
		| 'applicationName'
		| 'spanAttributes'
		| 'transformResultNames'
		| 'transformQueryNames'
		| 'transformJson'
		| 'metrics'
		| 'decode'
		| 'temporal'
		| 'prepare'
		| 'pipeline'
		| 'types'
	>
{}

/** Creates a client over `pg`. Its pool opens now and ends when the scope closes; `pg` stays open. An interrupt
 *  can't cancel a statement in PGlite, so it closes the connection, and the next statement opens a new one. */
export const make = (pg: PGliteLike, config: PGliteClientConfig = {}) =>
	makeWithOwnPool(config, () =>
		createPool(pg, {
			idleTimeoutMillis: config.idleTimeout === undefined ? undefined : Duration.toMillis(config.idleTimeout),
			applicationName: config.applicationName,
			decode: config.decode,
			temporal: config.temporal,
			prepare: config.prepare,
			pipeline: config.pipeline,
			types: config.types,
		}));

/** A layer over `pg`, with a pool opened when the layer is built and ended when its scope closes. */
export const layer = (pg: PGliteLike, config?: PGliteClientConfig) => layerFrom(make(pg, config));

/** Like `layer`, with the settings read from Effect Config. */
export const layerConfig = (pg: PGliteLike, config: Config.Wrap<PGliteClientConfig>) =>
	layerFrom(Effect.flatMap(Config.unwrap(config), (resolved) => make(pg, resolved)));
