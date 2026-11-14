// For the Effect entries that create their own pool: the Drizzle Postgres pool settings for a
// DrizzlePostgresClientConfig, and a client over a pool that opens now and ends when the scope closes.
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import type { Pool } from '../pool.ts';
import type { PoolConfig } from '../types.ts';
import { type DrizzlePostgresClientConfig, fromPool, toSqlError } from './DrizzlePostgresClient.ts';

const toMillis = (duration: Duration.Input | undefined) =>
	duration === undefined ? undefined : Duration.toMillis(duration);

/** The pool settings for `config`, without a transport. */
export const toPoolConfig = (config: DrizzlePostgresClientConfig) => ({
	url: config.url && Redacted.value(config.url),
	host: config.host,
	port: config.port,
	path: config.path,
	// The core's `ssl: true` only encrypts, like libpq's sslmode=require, so `true` becomes 'verify-full' here.
	ssl: config.ssl === true ? 'verify-full' as const : config.ssl,
	database: config.database,
	user: config.username,
	password: config.password && Redacted.value(config.password),
	connectTimeout: toMillis(config.connectTimeout),
	idleTimeoutMillis: toMillis(config.idleTimeout),
	max: config.maxConnections,
	applicationName: config.applicationName,
	decode: config.decode,
	temporal: config.temporal,
	prepare: config.prepare,
	pooler: config.pooler,
	pipeline: config.pipeline,
	types: config.types,
} satisfies PoolConfig);

/** A client over the pool that `create` returns. The pool opens now and ends when the scope closes. */
export const makeWithOwnPool = (config: DrizzlePostgresClientConfig, create: () => Pool) =>
	fromPool({
		...config,
		acquire: Effect.acquireRelease(
			Effect.try({ try: create, catch: (e) => toSqlError(e, 'connect') }),
			(pool) => Effect.promise(() => pool.end()),
		),
	});
