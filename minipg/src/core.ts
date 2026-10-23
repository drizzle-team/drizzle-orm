// Runtime-agnostic core entry — connect/createPool + the public API, with NO node:net/tls transport
// baked in (so it loads on workerd/Deno/edge). The node transport is added by ./index.ts (minipg/node);
// other runtimes import THIS module and supply config.transport or config.socket. connect() without
// either throws.
import { Connection } from './connection.ts';
import { Pool } from './pool.ts';
import type { ConnectConfig, PoolConfig } from './types.ts';

/** Open and authenticate a single connection. Accepts a config or a `postgres://…` connection string. */
export async function connect(config: string | ConnectConfig = {}): Promise<Connection> {
	const conn = new Connection(typeof config === 'string' ? { url: config } : config);
	await conn.connect();
	return conn;
}

/** Create a lazy connection pool. Accepts a config or a `postgres://…` connection string. */
export function createPool(config: string | PoolConfig = {}): Pool {
	return new Pool(config);
}

export * from './api.ts';
