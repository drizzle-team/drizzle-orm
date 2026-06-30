import { TursoClient } from '@effect/sql-tursodatabase/TursoClient';
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
	type EffectTursoDatabaseQueryEffectHKT,
	type EffectTursoDatabaseRunResult,
	EffectTursoDatabaseSession,
} from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectTursoDatabaseDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectTursoDatabaseQueryEffectHKT, EffectTursoDatabaseRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectTursoDatabaseDatabase';
}

/**
 * Creates an EffectTursoDatabaseDatabase instance.
 *
 * Requires `TursoClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * // With default services (no logging, no caching)
 * const db = yield* TursoDrizzle.make({ relations }).pipe(
 *   Effect.provide(TursoDrizzle.DefaultServices),
 * );
 *
 * // With Effect-based logging
 * const db = yield* TursoDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(TursoDrizzle.DefaultServices),
 * );
 *
 * // With custom Drizzle logger
 * const db = yield* TursoDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(TursoDrizzle.DefaultServices),
 * );
 * ```
 */
export const make = Effect.fn('TursoDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) {
		const client = yield* TursoClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect({
			useJitMappers: jitCompatCheck(config.jit),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectTursoDatabaseSession(client, dialect, relations, {
			logger,
			cache,
		});
		const db = new EffectTursoDatabaseDatabase(dialect, session, relations);
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectTursoDatabaseDatabase<TRelations> & {
			$client: TursoClient;
		};
	},
);

/**
 * Convenience function that creates an EffectTursoDatabaseDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
