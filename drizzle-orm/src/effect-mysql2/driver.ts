import { MysqlClient } from '@effect/sql-mysql2/MysqlClient';
import * as Effect from 'effect/Effect';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
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
 */
export const make = Effect.fn('MySqlDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleMySqlConfig<TRelations> = {}) {
		const client = yield* MysqlClient;
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
