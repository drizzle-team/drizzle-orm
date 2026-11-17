import { PgClient } from '@effect/sql-pg/PgClient';
import * as Effect from 'effect/Effect';
import { DefaultServices } from '~/effect-core/defaults.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { EffectDrizzlePgConfig } from '~/pg-core/effect/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { effectPgCodecs } from './codecs.ts';
import { type EffectPgQueryEffectHKT, type EffectPgQueryResultHKT, EffectPgSession } from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class EffectPgDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'EffectPgDatabase';
}

/**
 * Creates an EffectPgDatabase instance.
 *
 * Requires `PgClient`, and `EffectLogger` services to be provided.
 * Use `DefaultServices` to provide the default (no-op) logger implementation.
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
 *
 * Driver quirks:
 * - `timestamp` in `string` mode loses microseconds
 * - The driver itself fails on `point`, `line`, `bit`, `interval[]` and multidimensional arrays
 *
 * Unsupported column types (throw on non-null values):
 * - `timestamptz` in `string` mode (offset dropped)
 * - `macaddr`, `macaddr8`, `enum[]`, `geometry`, `vector`, `halfvec`, `sparsevec` (binary format decoded as corrupted text)
 */
export const make = Effect.fn('PgDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzlePgConfig<TRelations> = {}) {
		const client = yield* PgClient;
		const logger = yield* EffectLogger;

		const dialect = new PgDialect({
			useJitMappers: jitCompatCheck(config.jit),
			codecs: config.codecs ?? effectPgCodecs,
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectPgSession(client, dialect, relations, {
			logger,
			paramsInErrors: config.paramsInErrors,
		});
		const db = new EffectPgDatabase(dialect, session, relations) as EffectPgDatabase<TRelations>;
		(<any> db).$client = client;

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
