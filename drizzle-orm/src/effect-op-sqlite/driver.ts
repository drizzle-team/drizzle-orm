import type { OPSQLiteConnection } from '@op-engineering/op-sqlite';
import * as Context from 'effect/Context';
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
import { type EffectOPSQLiteQueryEffectHKT, type EffectOPSQLiteRunResult, EffectOPSQLiteSession } from './session.ts';
export { DefaultServices } from '~/effect-core/defaults.ts';

export class OPSQLiteClient extends Context.Service<OPSQLiteClient, OPSQLiteConnection>()(
	'drizzle-orm/effect-op-sqlite/OPSQLiteClient',
) {}

export class EffectOPSQLiteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteEffectDatabase<EffectOPSQLiteQueryEffectHKT, EffectOPSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'EffectOPSQLiteDatabase';
}

/**
 * Creates an EffectOPSQLiteDatabase instance.
 *
 * Requires `OPSQLiteClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Use `DefaultServices` to provide default (no-op) logger and cache implementations.
 *
 * @example
 * ```ts
 * const db = yield* OPSQLiteDrizzle.makeWithDefaults({ relations }).pipe(
 *   Effect.provideService(OPSQLiteDrizzle.OPSQLiteClient, client),
 * );
 * ```
 */
export const make = Effect.fn('OPSQLiteDrizzle.make')(
	function*<
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) {
		const client = yield* OPSQLiteClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new SQLiteDialect({
			useJitMappers: jitCompatCheck(config.jit),
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectOPSQLiteSession(client, dialect, relations, {
			logger,
			cache,
		});
		const db = new EffectOPSQLiteDatabase(dialect, session, relations);
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectOPSQLiteDatabase<TRelations> & {
			$client: OPSQLiteConnection;
		};
	},
);

/**
 * Convenience function that creates an EffectOPSQLiteDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleSQLiteConfig<TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
