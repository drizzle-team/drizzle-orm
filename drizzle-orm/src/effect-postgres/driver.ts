import { PgClient } from '@effect/sql-pg/PgClient';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as V1 from '~/_relations.ts';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { castToText, type PgCodecs, refineGenericPgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { _RelationalQueryBuilder } from '~/pg-core/query-builders/_query.ts';
import { makePgArray } from '~/pg-core/utils/array.ts';
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
> = Omit<DrizzleConfig<TSchema, TRelations>, 'cache' | 'logger'> & { codecs?: PgCodecs };

export const DefaultServices = Layer.merge(
	EffectCache.Default,
	EffectLogger.Default,
);

export const effectPgCodecs = refineGenericPgCodecs({
	date: {
		cast: castToText,
		normalizeParamArray: makePgArray,
	},
	interval: {
		cast: castToText,
		normalizeParamArray: makePgArray,
	},
	timestamp: {
		cast: castToText,
		normalizeParamArray: makePgArray,
	},
	timestamptz: {
		cast: castToText,
		normalizeParamArray: makePgArray,
	},
	json: {
		normalizeParam: (v) => JSON.stringify(v),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
	},

	bit: {
		normalizeParamArray: makePgArray,
	},
	bool: {
		normalizeParamArray: makePgArray,
	},
	box: {
		normalizeParamArray: makePgArray,
	},
	box2d: {
		normalizeParamArray: makePgArray,
	},
	box3d: {
		normalizeParamArray: makePgArray,
	},
	char: {
		normalizeParamArray: makePgArray,
	},
	cidr: {
		normalizeParamArray: makePgArray,
	},
	circle: {
		normalizeParamArray: makePgArray,
	},
	datemultirange: {
		normalizeParamArray: makePgArray,
	},
	daterange: {
		normalizeParamArray: makePgArray,
	},
	float8: {
		normalizeParamArray: makePgArray,
	},
	geography: {
		normalizeParamArray: makePgArray,
	},
	halfvec: {
		normalizeParamArray: makePgArray,
	},
	inet: {
		normalizeParamArray: makePgArray,
	},
	int4multirange: {
		normalizeParamArray: makePgArray,
	},
	int4range: {
		normalizeParamArray: makePgArray,
	},
	int8multirange: {
		normalizeParamArray: makePgArray,
	},
	int8range: {
		normalizeParamArray: makePgArray,
	},
	lseg: {
		normalizeParamArray: makePgArray,
	},
	macaddr: {
		normalizeParamArray: makePgArray,
	},
	money: {
		normalizeParamArray: makePgArray,
	},
	nummultirange: {
		normalizeParamArray: makePgArray,
	},
	numrange: {
		normalizeParamArray: makePgArray,
	},
	oid: {
		normalizeParamArray: makePgArray,
	},
	path: {
		normalizeParamArray: makePgArray,
	},
	polygon: {
		normalizeParamArray: makePgArray,
	},
	raster: {
		normalizeParamArray: makePgArray,
	},
	regclass: {
		normalizeParamArray: makePgArray,
	},
	regconfig: {
		normalizeParamArray: makePgArray,
	},
	regdictionary: {
		normalizeParamArray: makePgArray,
	},
	regnamespace: {
		normalizeParamArray: makePgArray,
	},
	regoper: {
		normalizeParamArray: makePgArray,
	},
	regoperator: {
		normalizeParamArray: makePgArray,
	},
	regproc: {
		normalizeParamArray: makePgArray,
	},
	regprocedure: {
		normalizeParamArray: makePgArray,
	},
	regrole: {
		normalizeParamArray: makePgArray,
	},
	regtype: {
		normalizeParamArray: makePgArray,
	},
	serial: {
		normalizeParamArray: makePgArray,
	},
	smallint: {
		normalizeParamArray: makePgArray,
	},
	smallserial: {
		normalizeParamArray: makePgArray,
	},
	sparsevec: {
		normalizeParamArray: makePgArray,
	},
	text: {
		normalizeParamArray: makePgArray,
	},
	time: {
		normalizeParamArray: makePgArray,
	},
	timetz: {
		normalizeParamArray: makePgArray,
	},
	tsmultirange: {
		normalizeParamArray: makePgArray,
	},
	tsquery: {
		normalizeParamArray: makePgArray,
	},
	tsrange: {
		normalizeParamArray: makePgArray,
	},
	tstzmultirange: {
		normalizeParamArray: makePgArray,
	},
	tstzrange: {
		normalizeParamArray: makePgArray,
	},
	tsvector: {
		normalizeParamArray: makePgArray,
	},
	varbit: {
		normalizeParamArray: makePgArray,
	},
	varchar: {
		normalizeParamArray: makePgArray,
	},
	vector: {
		normalizeParamArray: makePgArray,
	},
	xml: {
		normalizeParamArray: makePgArray,
	},
	bytea: {
		normalizeParamArray: makePgArray,
	},
	enum: {
		normalizeParamArray: makePgArray,
	},
	geometry: {
		normalizeParamArray: makePgArray,
	},
	line: {
		normalizeParamArray: makePgArray,
	},
	macaddr8: {
		normalizeParamArray: makePgArray,
	},
	numeric: {
		normalizeParamArray: makePgArray,
	},
	point: {
		normalizeParamArray: makePgArray,
	},
	bigint: {
		normalizeParamArray: makePgArray,
	},
	bigserial: {
		normalizeParamArray: makePgArray,
	},
	float4: {
		normalizeParamArray: makePgArray,
	},
	int: {
		normalizeParamArray: makePgArray,
	},
	uuid: {
		normalizeParamArray: makePgArray,
	},
});

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
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzleConfig<TSchema, TRelations> = {}) {
		const client = yield* PgClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new PgDialect({
			casing: config.casing,
			useJitMappers: config.useJitMappers,
			codecs: config.codecs ?? effectPgCodecs,
		});

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
		const session = new EffectPgSession(client, dialect, relations, schema, {
			logger,
			cache,
			useJitMapper: config.useJitMappers,
		});
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
 * Convenience function that creates an EffectPgDatabase with `DefaultServices` already provided.
 */
export const makeWithDefaults = <
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(config: EffectDrizzleConfig<TSchema, TRelations> = {}) => make(config).pipe(Effect.provide(DefaultServices));
