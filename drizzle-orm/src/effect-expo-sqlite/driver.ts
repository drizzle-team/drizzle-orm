import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import type { SQLiteDatabase } from 'expo-sqlite';
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
	type EffectExpoSQLiteQueryEffectHKT,
	type EffectExpoSQLiteRunResult,
	EffectExpoSQLiteSession,
} from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class ExpoSQLiteClient extends Context.Service<ExpoSQLiteClient, SQLiteDatabase>()(
	'drizzle-orm/effect-expo-sqlite/ExpoSQLiteClient',
) {}

export class EffectExpoSQLiteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectExpoSQLiteQueryEffectHKT, EffectExpoSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectExpoSQLiteDatabase';
}

/**
 * Creates an EffectExpoSQLiteDatabase instance.
 *
 * Requires `ExpoSQLiteClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * const db = yield* ExpoSQLiteDrizzle.makeWithDefaults({ relations }).pipe(
 *   Effect.provideService(ExpoSQLiteDrizzle.ExpoSQLiteClient, client),
 * );
 * ```
 */
export const make = Effect.fn('ExpoSQLiteDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) {
		const client = yield* ExpoSQLiteClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect({
			useJitMappers: jitCompatCheck(config.jit),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectExpoSQLiteSession(client, dialect, relations, {
			logger,
			cache,
		});
		const db = new EffectExpoSQLiteDatabase(dialect, session, relations);
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectExpoSQLiteDatabase<TRelations> & {
			$client: SQLiteDatabase;
		};
	},
);

/**
 * Convenience function that creates an EffectExpoSQLiteDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
