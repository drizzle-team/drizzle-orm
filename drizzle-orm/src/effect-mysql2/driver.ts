import { MysqlClient } from '@effect/sql-mysql2/MysqlClient';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import { MySqlEffectDatabase } from '~/mysql-core/effect/db.ts';
import type { EffectDrizzleMySqlConfig } from '~/mysql-core/effect/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { effectMysql2Codecs } from './codecs.ts';
import { type EffectMysql2QueryEffectHKT, type EffectMysql2QueryResultHKT, EffectMysql2Session } from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectMysql2Database<TRelations extends AnyRelations = EmptyRelations>
	extends MySqlEffectDatabase<EffectMysql2QueryEffectHKT, EffectMysql2QueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectMysql2Database';
}

/** mysql2 options of the client's pool: `@effect/sql-mysql2` passes `poolConfig` through, or the url's query string */
const poolOptionsOf = (client: MysqlClient): { dateStrings?: unknown; decimalNumbers?: unknown } => {
	const { url, poolConfig } = client.config;
	if (url === undefined) return poolConfig ?? {};

	// mysql2 parses url query parameters as JSON, falling back to the raw text
	const options: Record<string, unknown> = {};
	for (const [key, value] of new URL(Redacted.value(url)).searchParams) {
		try {
			options[key] = JSON.parse(value);
		} catch {
			options[key] = value;
		}
	}
	return options;
};

const temporalTypes = ['DATE', 'DATETIME', 'TIMESTAMP'];

/**
 * `@effect/sql-mysql2` accepts no per-query type casts, so pool options that lose data are rejected: temporal values
 * are decoded to `Date`s in the connection's time zone without `dateStrings` (shifting wall-clock times that don't exist
 * in it, misreading years below 100), `decimal` values to numbers with `decimalNumbers`
 */
const assertLosslessPoolOptions = (client: MysqlClient) => {
	const { dateStrings, decimalNumbers } = poolOptionsOf(client);
	const types = dateStrings === true
		? temporalTypes
		: Array.isArray(dateStrings)
		? dateStrings
		: typeof dateStrings === 'string'
		? [dateStrings]
		: [];
	if (!temporalTypes.every((type) => types.includes(type))) {
		throw new DrizzleError({
			message: "`@effect/sql-mysql2`'s client must be created with `dateStrings: true` (in `poolConfig`, or as "
				+ "`?dateStrings=true` in `url`): without it, temporal values are decoded to `Date`s in the connection's time "
				+ "zone, shifting wall-clock times that don't exist in it and misreading years below 100",
		});
	}
	if (decimalNumbers === true) {
		throw new DrizzleError({
			message: "`@effect/sql-mysql2`'s client must not be created with `decimalNumbers: true`: it decodes `decimal` "
				+ 'values to numbers, losing precision',
		});
	}
};

/**
 * Creates an EffectMysql2Database instance.
 *
 * Requires `MysqlClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * // With default services (no logging, no caching)
 * const db = yield* MySqlDrizzle.make({ relations }).pipe(
 *   Effect.provide(MySqlDrizzle.DefaultServices),
 * );
 *
 * // With Effect-based logging
 * const db = yield* MySqlDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(MySqlDrizzle.DefaultServices),
 * );
 *
 * // With custom Drizzle logger
 * const db = yield* MySqlDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(MySqlDrizzle.DefaultServices),
 * );
 * ```
 *
 * Requirements:
 * - The client's pool must be created with `dateStrings: true` and without `decimalNumbers: true`, throws otherwise
 *
 * Driver quirks:
 * - `time` and `string`-mode `datetime`, `timestamp` lose trailing zeros of fractional seconds
 */
export const make = Effect.fn('MySqlDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleMySqlConfig<TRelations> = {}) {
		const client = yield* MysqlClient;
		assertLosslessPoolOptions(client);
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new MySqlDialect({
			useJitMappers: jitCompatCheck(config.jit),
			codecs: config.codecs ?? effectMysql2Codecs,
			paginationToBigint: true,
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectMysql2Session(client, dialect, relations, {
			logger,
			cache,
			paramsInErrors: config.paramsInErrors,
		});
		const db = new EffectMysql2Database(dialect, session, relations) as EffectMysql2Database<TRelations>;
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectMysql2Database<TRelations> & {
			$client: MysqlClient;
		};
	},
);

/**
 * Convenience function that creates an EffectMysql2Database with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleMySqlConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
