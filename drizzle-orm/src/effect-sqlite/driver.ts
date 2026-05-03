import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { SqlClient } from 'effect/unstable/sql/SqlClient';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteEffectDatabase } from '~/sqlite-core/effect/db.ts';
import { type DrizzleConfig, jitCompatCheck } from '~/utils.ts';
import { type EffectSQLiteQueryEffectHKT, type EffectSQLiteRunResult, EffectSQLiteSession } from './session.ts';

export class EffectSQLiteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectSQLiteQueryEffectHKT, EffectSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteDatabase';
}

export type EffectDrizzleSQLiteConfig<
	TRelations extends AnyRelations = EmptyRelations,
> = Omit<DrizzleConfig<Record<string, never>, TRelations>, 'cache' | 'logger' | 'schema'>;

export const DefaultServices = Layer.merge(
	EffectCache.Default,
	EffectLogger.Default,
);

/**
 * Creates an EffectSQLiteDatabase instance.
 *
 * Requires a generic Effect `SqlClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * SQLite-specific clients from `@effect/sql-sqlite-node`, `@effect/sql-sqlite-bun`, and related packages
 * all provide the generic `SqlClient` service.
 *
 * @example
 * ```ts
 * import { SqliteClient } from '@effect/sql-sqlite-node';
 * import * as SQLiteDrizzle from 'drizzle-orm/effect-sqlite';
 * import * as Effect from 'effect/Effect';
 *
 * const db = yield* SQLiteDrizzle.make({ relations }).pipe(
 *   Effect.provide(SQLiteDrizzle.DefaultServices),
 *   Effect.provide(SqliteClient.layer({ filename: 'sqlite.db' })),
 * );
 * ```
 */
export const make = Effect.fn('SQLiteDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) {
		const client = yield* SqlClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteAsyncDialect();
		const relations = config.relations ?? {} as TRelations;
		const session = new EffectSQLiteSession(client, dialect, relations, {
			logger,
			cache,
			useJitMappers: jitCompatCheck(config.jit),
		});
		const db = new EffectSQLiteDatabase(dialect, session, relations) as EffectSQLiteDatabase<TRelations> & {
			$client: SqlClient;
		};
		db.$client = client;
		db.$cache.invalidate = cache.onMutate;

		return db;
	},
);

/**
 * Convenience function that creates an EffectSQLiteDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
