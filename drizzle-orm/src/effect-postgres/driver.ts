import { PgClient } from '@effect/sql-pg/PgClient';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { effectPgCodecs } from './codecs.ts';
import { type EffectPgQueryEffectHKT, type EffectPgQueryResultHKT, EffectPgSession } from './session.ts';

export class EffectPgDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectPgDatabase';
}

export type EffectDrizzlePgConfig<
	TRelations extends AnyRelations = EmptyRelations,
> = Omit<DrizzlePgConfig<TRelations>, 'cache' | 'logger'>;

export const DefaultServices = Layer.merge(
	EffectCache.Default,
	EffectLogger.Default,
);

/**
 * Creates an EffectPgDatabase instance.
 *
 * Requires `PgClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * // With default services (no logging, no caching)
 * const db = yield* PgDrizzle.make({ relations }).pipe(
 *   Effect.provide(PgDrizzle.DefaultServices),
 * );
 *
 * // With Effect-based logging
 * const db = yield* PgDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layer),
 *   Effect.provide(PgDrizzle.DefaultServices),
 * );
 *
 * // With custom Drizzle logger
 * const db = yield* PgDrizzle.make({ relations }).pipe(
 *   Effect.provide(EffectLogger.layerFromDrizzle(myLogger)),
 *   Effect.provide(PgDrizzle.DefaultServices),
 * );
 * ```
 */
export const make = Effect.fn('PgDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzlePgConfig<TRelations> = {}) {
		const client = yield* PgClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new PgDialect({
			useJitMappers: jitCompatCheck(config.jit),
			codecs: config.codecs ?? effectPgCodecs,
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectPgSession(client, dialect, relations, {
			logger,
			cache,
			useJitMappers: jitCompatCheck(config.jit),
		});
		const db = new EffectPgDatabase(dialect, session, relations) as EffectPgDatabase<TRelations>;
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectPgDatabase<TRelations> & {
			$client: PgClient;
		};
	},
);

/**
 * Convenience function that creates an EffectPgDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzlePgConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
