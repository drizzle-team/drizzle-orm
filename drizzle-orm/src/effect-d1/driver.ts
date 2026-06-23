import { D1Client } from '@effect/sql-d1/D1Client';
import * as Effect from 'effect/Effect';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteEffectDatabase } from '~/sqlite-core/effect/db.ts';
import type { EffectDrizzleSQLiteConfig } from '~/sqlite-core/effect/utils.ts';
import { type EffectSQLiteD1QueryEffectHKT, type EffectSQLiteD1RunResult, EffectSQLiteD1Session } from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export type EffectDrizzleSQLiteD1Config<TRelations extends AnyRelations> = Omit<
	EffectDrizzleSQLiteConfig<TRelations>,
	'jit'
>;

export class EffectSQLiteD1Database<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectSQLiteD1QueryEffectHKT, EffectSQLiteD1RunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteD1Database';
}

/**
 * Creates an EffectSQLiteD1Database instance.
 *
 * Requires `D1Client`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * // With default services (no logging, no caching)
 * const db = yield* SQLiteD1Drizzle.make({ relations }).pipe(
 *   Effect.provide(SQLiteD1Drizzle.DefaultServices),
 * );
 *
 * // With Effect-based logging
 * const db = yield* SQLiteD1Drizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(SQLiteD1Drizzle.DefaultServices),
 * );
 *
 * // With custom Drizzle logger
 * const db = yield* SQLiteD1Drizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(SQLiteD1Drizzle.DefaultServices),
 * );
 * ```
 */
export const make = Effect.fn('SQLiteD1Drizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteD1Config<TRelations>) {
		const client = yield* D1Client;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect();

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectSQLiteD1Session(client, dialect, relations, {
			logger,
			cache,
		});
		const db = new EffectSQLiteD1Database(dialect, session, relations, true);
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectSQLiteD1Database<TRelations> & {
			$client: D1Client;
		};
	},
);

/**
 * Convenience function that creates an EffectSQLiteD1Database with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteD1Config<TRelations>) => make(config).pipe(Effect.provide(DefaultServices));
