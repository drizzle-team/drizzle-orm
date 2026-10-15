/// <reference types="@cloudflare/workers-types" />
import { SqliteClient } from '@effect/sql-sqlite-do/SqliteClient';
import * as Effect from 'effect/Effect';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteEffectDatabase } from '~/sqlite-core/effect/db.ts';
import type { EffectDrizzleSQLiteConfig } from '~/sqlite-core/effect/utils.ts';
import { type EffectSQLiteDoQueryEffectHKT, type EffectSQLiteDoRunResult, EffectSQLiteDOSession } from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectSQLiteDoDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectSQLiteDoQueryEffectHKT, EffectSQLiteDoRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteDoDatabase';
}

export type EffectDrizzleSQLiteDoConfig<TRelations extends AnyRelations> =
	& Omit<EffectDrizzleSQLiteConfig<TRelations>, 'jit'>
	& {
		/** Required to make transactions functional by bypassing broken implementation from `@effect/sql-sqlite-do` wrapper */
		storage: DurableObjectStorage;
	};

/**
 * Creates an EffectSQLiteDoDatabase instance.
 *
 * Requires `SqliteClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * // With default services (no logging, no caching)
 * const db = yield* SQLiteDODrizzle.make({ relations }).pipe(
 *   Effect.provide(SQLiteDODrizzle.DefaultServices),
 * );
 *
 * // With Effect-based logging
 * const db = yield* SQLiteDODrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(SQLiteDODrizzle.DefaultServices),
 * );
 *
 * // With custom Drizzle logger
 * const db = yield* SQLiteDODrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(SQLiteDODrizzle.DefaultServices),
 * );
 * ```
 */
export const make = Effect.fn('SQLiteDODrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteDoConfig<TRelations>) {
		const client = yield* SqliteClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect();

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectSQLiteDOSession(client, dialect, relations, {
			logger,
			cache,
			storage: config.storage,
		});
		const db = new EffectSQLiteDoDatabase(dialect, session, relations);
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectSQLiteDoDatabase<TRelations> & {
			$client: SqliteClient;
		};
	},
);

/**
 * Convenience function that creates an EffectSQLiteDoDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteDoConfig<TRelations>) => make(config).pipe(Effect.provide(DefaultServices));
