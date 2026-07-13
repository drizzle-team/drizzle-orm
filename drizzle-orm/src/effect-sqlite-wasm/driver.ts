import { SqliteClient } from '@effect/sql-sqlite-wasm/SqliteClient';
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
	type EffectSQLiteWasmQueryEffectHKT,
	type EffectSQLiteWasmRunResult,
	EffectSQLiteWasmSession,
} from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectSQLiteWasmDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectSQLiteWasmQueryEffectHKT, EffectSQLiteWasmRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteWasmDatabase';
}

/**
 * Creates an EffectSQLiteWasmDatabase instance.
 *
 * Requires `SqliteClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * // With default services (no logging, no caching)
 * const db = yield* SQLiteWasmDrizzle.make({ relations }).pipe(
 *   Effect.provide(SQLiteWasmDrizzle.DefaultServices),
 * );
 *
 * // With Effect-based logging
 * const db = yield* SQLiteWasmDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(SQLiteWasmDrizzle.DefaultServices),
 * );
 *
 * // With custom Drizzle logger
 * const db = yield* SQLiteWasmDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(SQLiteWasmDrizzle.DefaultServices),
 * );
 * ```
 */
export const make = Effect.fn('SQLiteWasmDrizzle.make')(
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
		const session = new EffectSQLiteWasmSession(client, dialect, relations, {
			logger,
			cache,
		});
		const db = new EffectSQLiteWasmDatabase(dialect, session, relations);
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectSQLiteWasmDatabase<TRelations> & {
			$client: SqliteClient;
		};
	},
);

/**
 * Convenience function that creates an EffectSQLiteWasmDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
