import { PgClient } from '@effect/sql-pg/PgClient';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { EffectLogger } from '~/effect-core/index.ts';
import { entityKind } from '~/entity.ts';
import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToText,
	castToTextArr,
	parseGeometryTuple,
	parseGeometryXY,
	parsePgArrayAndNormalize,
	refineGenericPgCodecs,
	textToDate,
	textToDateWithTz,
} from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectDatabase } from '~/pg-core/effect/db.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
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

export const effectPgCodecs = refineGenericPgCodecs({
	bigint: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeParamArray: makePgArray,
	},
	bigserial: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		normalizeParamArray: makePgArray,
	},
	bit: {
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	date: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
		normalizeParamArray: makePgArray,
	},
	'date:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	geometry: {
		normalizeArray: parsePgArrayAndNormalize(parseGeometryXY),
		normalizeParamArray: makePgArray,
	},
	'geometry:tuple': {
		normalizeArray: parsePgArrayAndNormalize(parseGeometryTuple),
		normalizeParamArray: makePgArray,
	},
	interval: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	line: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	'line:tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	point: {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	'point:tuple': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	timestamp: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: textToDateWithTz,
		normalizeArray: arrayCompatNormalize(textToDateWithTz),
		normalizeParamArray: makePgArray,
	},
	timestamptz: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
		normalizeParamArray: makePgArray,
	},
	'timestamp:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	'timestamptz:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	json: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},

	bool: { normalizeParamArray: makePgArray },
	box: { normalizeParamArray: makePgArray },
	box2d: { normalizeParamArray: makePgArray },
	box3d: { normalizeParamArray: makePgArray },
	char: { normalizeParamArray: makePgArray },
	cidr: { normalizeParamArray: makePgArray },
	circle: { normalizeParamArray: makePgArray },
	datemultirange: { normalizeParamArray: makePgArray },
	daterange: { normalizeParamArray: makePgArray },
	float8: { normalizeParamArray: makePgArray },
	geography: { normalizeParamArray: makePgArray },
	inet: { normalizeParamArray: makePgArray },
	int4multirange: { normalizeParamArray: makePgArray },
	int4range: { normalizeParamArray: makePgArray },
	int8multirange: { normalizeParamArray: makePgArray },
	int8range: { normalizeParamArray: makePgArray },
	lseg: { normalizeParamArray: makePgArray },
	macaddr: { normalizeParamArray: makePgArray },
	money: { normalizeParamArray: makePgArray },
	nummultirange: { normalizeParamArray: makePgArray },
	numrange: { normalizeParamArray: makePgArray },
	oid: { normalizeParamArray: makePgArray },
	path: { normalizeParamArray: makePgArray },
	polygon: { normalizeParamArray: makePgArray },
	raster: { normalizeParamArray: makePgArray },
	regclass: { normalizeParamArray: makePgArray },
	regconfig: { normalizeParamArray: makePgArray },
	regdictionary: { normalizeParamArray: makePgArray },
	regnamespace: { normalizeParamArray: makePgArray },
	regoper: { normalizeParamArray: makePgArray },
	regoperator: { normalizeParamArray: makePgArray },
	regproc: { normalizeParamArray: makePgArray },
	regprocedure: { normalizeParamArray: makePgArray },
	regrole: { normalizeParamArray: makePgArray },
	regtype: { normalizeParamArray: makePgArray },
	serial: { normalizeParamArray: makePgArray },
	smallint: { normalizeParamArray: makePgArray },
	smallserial: { normalizeParamArray: makePgArray },
	text: { normalizeParamArray: makePgArray },
	time: { normalizeParamArray: makePgArray },
	timetz: { normalizeParamArray: makePgArray },
	tsmultirange: { normalizeParamArray: makePgArray },
	tsquery: { normalizeParamArray: makePgArray },
	tsrange: { normalizeParamArray: makePgArray },
	tstzmultirange: { normalizeParamArray: makePgArray },
	tstzrange: { normalizeParamArray: makePgArray },
	tsvector: { normalizeParamArray: makePgArray },
	varbit: { normalizeParamArray: makePgArray },
	varchar: { normalizeParamArray: makePgArray },
	xml: { normalizeParamArray: makePgArray },
	bytea: { normalizeParamArray: makePgArray },
	enum: { normalizeParamArray: makePgArray },
	numeric: { normalizeParamArray: makePgArray },
	'numeric:number': { normalizeParamArray: makePgArray },
	'numeric:bigint': { normalizeParamArray: makePgArray },
	'bigint:number': { normalizeParamArray: makePgArray },
	'bigint:string': { normalizeParamArray: makePgArray },
	'bigserial:number': { normalizeParamArray: makePgArray },
	float4: { normalizeParamArray: makePgArray },
	int: { normalizeParamArray: makePgArray },
	uuid: { normalizeParamArray: makePgArray },
	halfvec: { normalizeParamArray: makePgArray },
	sparsevec: {
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	vector: { normalizeParamArray: makePgArray },
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
		TRelations extends AnyRelations = EmptyRelations,
	>(config: EffectDrizzlePgConfig<TRelations> = {}) {
		const client = yield* PgClient;
		const cache = yield* EffectCache;
		const logger = yield* EffectLogger;

		const dialect = new PgDialect({
			useJitMappers: config.useJitMappers,
			codecs: config.codecs ?? effectPgCodecs,
		});

		const relations = config.relations ?? {} as TRelations;
		const session = new EffectPgSession(client, dialect, relations, {
			logger,
			cache,
			useJitMapper: config.useJitMappers,
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
