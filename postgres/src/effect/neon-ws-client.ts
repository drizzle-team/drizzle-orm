// The DrizzlePostgresClient namespace for Neon over its WebSocket proxy. Its make, layer and layerConfig create the
// pool with @drizzle-team/postgres/neon-ws, so prepared statements, pipelining, transactions, COPY and cursors work
// as they do over TCP.
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import { createPool, type NeonWsExtra } from '../neon-ws.ts';
import { type DrizzlePostgresClientConfig, layerFrom } from './DrizzlePostgresClient.ts';
import { makeWithOwnPool, toPoolConfig } from './owned-pool.ts';

export * from './DrizzlePostgresClient.ts';

/** DrizzlePostgresClientConfig without `ssl` and `path`: the WebSocket carries the TLS (see `secure`), and the
 *  proxy is reached by host. */
export interface NeonWsClientConfig extends Omit<DrizzlePostgresClientConfig, 'ssl' | 'path'>, NeonWsExtra {}

/** Creates a client with its own pool over Neon's WebSocket proxy. The pool opens now and ends when the scope
 *  closes. */
export const make = (config: NeonWsClientConfig) =>
	makeWithOwnPool(config, () =>
		createPool({
			...toPoolConfig(config),
			webSocketConstructor: config.webSocketConstructor,
			wsProxy: config.wsProxy,
			secure: config.secure,
		}));

/** A layer with its own pool, opened when the layer is built and ended when its scope closes. */
export const layer = (config: NeonWsClientConfig) => layerFrom(make(config));

/** Like `layer`, with the settings read from Effect Config. */
export const layerConfig = (config: Config.Wrap<NeonWsClientConfig>) =>
	layerFrom(Effect.flatMap(Config.unwrap(config), make));
