import { SqliteClient } from '@effect/sql-sqlite-node/SqliteClient';
import * as Effect from 'effect/Effect';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteEffectDatabase } from '~/sqlite-core/effect/db.ts';
import type { EffectDrizzleSQLiteConfig } from '~/sqlite-core/effect/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import {
	type EffectSQLiteNodeQueryEffectHKT,
	type EffectSQLiteNodeRunResult,
	EffectSQLiteNodeSession,
} from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectSQLiteNodeDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectSQLiteNodeQueryEffectHKT, EffectSQLiteNodeRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteNodeDatabase';
}

/**
 * Creates an EffectSQLiteNodeDatabase instance.
 *
 * Requires `SqliteClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * // With default services (no logging, no caching)
 * const db = yield* SQLiteNodeDrizzle.make({ relations }).pipe(
 *   Effect.provide(SQLiteNodeDrizzle.DefaultServices),
 * );
 *
 * // With Effect-based logging
 * const db = yield* SQLiteNodeDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(SQLiteNodeDrizzle.DefaultServices),
 * );
 *
 * // With custom Drizzle logger
 * const db = yield* SQLiteNodeDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(SQLiteNodeDrizzle.DefaultServices),
 * );
 * ```
 */
export const make = Effect.fn('SQLiteNodeDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) {
		const client = yield* SqliteClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect({
			useJitMappers: jitCompatCheck(config.jit),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectSQLiteNodeSession(client, dialect, relations, {
			logger,
			cache,
		});
		const db = new EffectSQLiteNodeDatabase(dialect, session, relations);
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectSQLiteNodeDatabase<TRelations> & {
			$client: SqliteClient;
		};
	},
);

/**
 * Convenience function that creates an EffectSQLiteNodeDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
