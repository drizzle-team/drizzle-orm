import { SqliteClient } from '@effect/sql-sqlite-node/SqliteClient';
import * as Effect from 'effect/Effect';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteEffectDatabase } from '~/sqlite-core/effect/db.ts';
import type { EffectDrizzleSQLiteConfig } from '~/sqlite-core/effect/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { effectSQLiteNodeCodecs } from './codecs.ts';
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
 * Requires `SqliteClient`, and `EffectLogger` services to be provided.
 * Use `DefaultServices` to provide the default (no-op) logger implementation.
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
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect({
			codecs: config.codecs ?? effectSQLiteNodeCodecs,
			useJitMappers: jitCompatCheck(config.jit),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectSQLiteNodeSession(client, dialect, relations, {
			logger,
			paramsInErrors: config.paramsInErrors,
		});
		const db = new EffectSQLiteNodeDatabase(dialect, session, relations);
		(<any> db).$client = client;

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
