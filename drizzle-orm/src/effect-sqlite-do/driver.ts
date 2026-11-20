import { SqliteClient } from '@effect/sql-sqlite-do/SqliteClient';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteEffectDatabase } from '~/sqlite-core/effect/db.ts';
import type { EffectDrizzleSQLiteConfig } from '~/sqlite-core/effect/utils.ts';
import { effectSQLiteDoCodecs } from './codecs.ts';
import { type EffectSQLiteDoQueryEffectHKT, type EffectSQLiteDoRunResult, EffectSQLiteDOSession } from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectSQLiteDoDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectSQLiteDoQueryEffectHKT, EffectSQLiteDoRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteDoDatabase';
}

export type EffectDrizzleSQLiteDoConfig<TRelations extends AnyRelations> = Omit<
	EffectDrizzleSQLiteConfig<TRelations>,
	'jit'
>;

/**
 * Creates an EffectSQLiteDoDatabase instance.
 *
 * Requires `SqliteClient`, and `EffectLogger` services to be provided.
 * Use `DefaultServices` to provide the default (no-op) logger implementation.
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
 *
 * Driver quirks:
 * - Integers past the safe integer range are read as numbers: `numeric` columns throw on them
 */
export const make = Effect.fn('SQLiteDODrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteDoConfig<TRelations>) {
		const client = yield* SqliteClient;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect({
			codecs: config.codecs ?? effectSQLiteDoCodecs,
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectSQLiteDOSession(client, dialect, relations, {
			logger,
			paramsInErrors: config.paramsInErrors,
		});
		const db = new EffectSQLiteDoDatabase(dialect, session, relations);
		(<any> db).$client = client;

		return db as EffectSQLiteDoDatabase<TRelations> & {
			$client: Context.Service.Shape<typeof SqliteClient>;
		};
	},
);

/**
 * Convenience function that creates an EffectSQLiteDoDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteDoConfig<TRelations>) => make(config).pipe(Effect.provide(DefaultServices));
