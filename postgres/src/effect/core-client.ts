// The DrizzlePostgresClient namespace of /effect/core. Its make, layer and layerConfig need a DrizzlePostgresTransport in
// context; the runtime entries provide theirs.
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import { Pool } from '../pool.ts';
import { type DrizzlePostgresClientConfig, layerFrom } from './DrizzlePostgresClient.ts';
import { DrizzlePostgresTransport } from './DrizzlePostgresTransport.ts';
import { makeWithOwnPool, toPoolConfig } from './owned-pool.ts';

export * from './DrizzlePostgresClient.ts';

/** Creates a client with its own pool, which dials with the DrizzlePostgresTransport from context. The pool opens
 *  now and ends when the scope closes. */
export const make = (config: DrizzlePostgresClientConfig) =>
	Effect.flatMap(
		Effect.service(DrizzlePostgresTransport),
		(transport) => makeWithOwnPool(config, () => new Pool({ ...toPoolConfig(config), transport })),
	);

/** A layer with its own pool, opened when the layer is built and ended when its scope closes. It needs
 *  a DrizzlePostgresTransport, such as `DrizzlePostgresTransport.layer` from the runtime's entry point. */
export const layer = (config: DrizzlePostgresClientConfig) => layerFrom(make(config));

/** Like `layer`, with the settings read from Effect Config. */
export const layerConfig = (config: Config.Wrap<DrizzlePostgresClientConfig>) =>
	layerFrom(Effect.flatMap(Config.unwrap(config), make));
