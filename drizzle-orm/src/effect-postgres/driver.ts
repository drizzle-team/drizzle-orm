import { PgClient } from '@effect/sql-pg/PgClient';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as V1 from '~/_relations.ts';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { _RelationalQueryBuilder } from '~/pg-core/query-builders/_query.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type EffectPgQueryEffectHKT, type EffectPgQueryResultHKT, EffectPgSession } from './session.ts';

export class EffectPgDatabase<
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgEffectDatabase<EffectPgQueryEffectHKT, EffectPgQueryResultHKT, TFullSchema, TRelations> {
	static override readonly [entityKind]: string = 'EffectPgDatabase';
}

export type EffectDrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> = Omit<DrizzleConfig<TSchema, TRelations>, 'cache' | 'logger'>;

export const DefaultServices = Layer.merge(
	EffectCache.Default,
	EffectLogger.Default,
);

export const make = Effect.fn('PgDrizzle.make')(
	function*<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleConfig<TSchema, TRelations> = {}) {
		const client = yield* PgClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new PgDialect({ casing: config.casing });

		let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
		if (config.schema) {
			const tablesConfig = V1.extractTablesRelationalConfig(
				config.schema,
				V1.createTableRelationsHelpers,
			);
			schema = {
				fullSchema: config.schema,
				schema: tablesConfig.tables,
				tableNamesMap: tablesConfig.tableNamesMap,
			};
		}

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectPgSession(client, dialect, relations, schema, logger, cache);
		const db = new EffectPgDatabase(
			dialect,
			session,
			relations,
			schema as V1.RelationalSchemaConfig<any>,
		) as EffectPgDatabase<TSchema>;
		(<any> db).$client = client;
		(<any> db).$cache = cache;
		if ((<any> db).$cache) {
			(<any> db).$cache['invalidate'] = cache.onMutate;
		}

		return db as EffectPgDatabase<TSchema, TRelations> & {
			$client: PgClient;
		};
	},
);

/**
 * Creates an EffectPgDatabase with default services (EffectLogger.Default and EffectCache.Default).
 * This is a convenience function for users who don't need custom service implementations.
 *
 * For custom services, use `make()` directly and provide your own layers before `DefaultServices`:
 * ```ts
 * PgDrizzle.make({ ... }).pipe(
 *   Effect.provide(myCustomLogger),
 *   Effect.provide(PgDrizzle.DefaultServices),
 * )
 * ```
 */
export const makeWithDefaults = <
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleConfig<TSchema, TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
