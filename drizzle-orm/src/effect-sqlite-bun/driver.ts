import { SqliteClient } from '@effect/sql-sqlite-bun/SqliteClient';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteEffectDatabase } from '~/sqlite-core/effect/db.ts';
import type { EffectDrizzleSQLiteConfig } from '~/sqlite-core/effect/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { effectSQLiteBunCodecs } from './codecs.ts';
import {
	type EffectSQLiteBunQueryEffectHKT,
	type EffectSQLiteBunRunResult,
	EffectSQLiteBunSession,
} from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectSQLiteBunDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectSQLiteBunQueryEffectHKT, EffectSQLiteBunRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectSQLiteBunDatabase';
}

/**
 * Creates an EffectSQLiteBunDatabase instance.
 *
 * Requires `SqliteClient`, and `EffectLogger` services to be provided.
 * Use `DefaultServices` to provide the default (no-op) logger implementation.
 *
 * @example
 * ```ts
 * // With default services (no logging, no caching)
 * const db = yield* SQLiteBunDrizzle.make({ relations }).pipe(
 *   Effect.provide(SQLiteBunDrizzle.DefaultServices),
 * );
 *
 * // With Effect-based logging
 * const db = yield* SQLiteBunDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(SQLiteBunDrizzle.DefaultServices),
 * );
 *
 * // With custom Drizzle logger
 * const db = yield* SQLiteBunDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(SQLiteBunDrizzle.DefaultServices),
 * );
 * ```
 */
export const make = Effect.fn('SQLiteBunDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) {
		const client = yield* SqliteClient;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect({
			codecs: config.codecs ?? effectSQLiteBunCodecs,
			useJitMappers: jitCompatCheck(config.jit),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectSQLiteBunSession(client, dialect, relations, {
			logger,
			paramsInErrors: config.paramsInErrors,
		});
		const db = new EffectSQLiteBunDatabase(dialect, session, relations);
		(<any> db).$client = client;

		return db as EffectSQLiteBunDatabase<TRelations> & {
			$client: Context.Service.Shape<typeof SqliteClient>;
		};
	},
);

/**
 * Convenience function that creates an EffectSQLiteBunDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
