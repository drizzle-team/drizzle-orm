import { LibsqlClient } from '@effect/sql-libsql/LibsqlClient';
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
import { type EffectLibsqlQueryEffectHKT, type EffectLibsqlRunResult, EffectLibsqlSession } from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectLibsqlDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectLibsqlQueryEffectHKT, EffectLibsqlRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectLibsqlDatabase';
}

/**
 * Creates an EffectLibsqlDatabase instance.
 *
 * Requires `LibsqlClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * // With default services (no logging, no caching)
 * const db = yield* LibsqlDrizzle.make({ relations }).pipe(
 *   Effect.provide(LibsqlDrizzle.DefaultServices),
 * );
 *
 * // With Effect-based logging
 * const db = yield* LibsqlDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(LibsqlDrizzle.DefaultServices),
 * );
 *
 * // With custom Drizzle logger
 * const db = yield* LibsqlDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(LibsqlDrizzle.DefaultServices),
 * );
 * ```
 */
export const make = Effect.fn('LibsqlDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) {
		const client = yield* LibsqlClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect({
			useJitMappers: jitCompatCheck(config.jit),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectLibsqlSession(client, dialect, relations, {
			logger,
			cache,
		});
		const db = new EffectLibsqlDatabase(dialect, session, relations);
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectLibsqlDatabase<TRelations> & {
			$client: LibsqlClient;
		};
	},
);

/**
 * Convenience function that creates an EffectLibsqlDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
