/// <reference types="bun-types" />

import { SQL } from 'bun';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import {
	arrayCompatNormalize,
	arrayCompatNormalizeInput,
	castToText,
	castToTextArr,
	parseGeometryTuple,
	parseGeometryXY,
	parsePgArrayAndNormalize,
	refineGenericPgCodecs,
} from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { BunSQLQueryResultHKT } from './session.ts';
import { BunSQLSession } from './session.ts';

export const bunSqlPgCodecs = refineGenericPgCodecs({
	date: { normalizeParamArray: makePgArray },
	'date:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	uuid: {
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	timestamp: { normalizeParamArray: makePgArray },
	timestamptz: { normalizeParamArray: makePgArray },
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
	float4: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: makePgArray,
	},
	bigint: {
		normalizeParamArray: makePgArray,
	},
	'bigint:number': { normalizeParamArray: makePgArray },
	'bigint:string': {
		cast: castToText,
		castArray: castToTextArr,
		normalizeParamArray: makePgArray,
	},
	bigserial: { normalizeParamArray: makePgArray },
	'bigserial:number': { normalizeParamArray: makePgArray },
	int: {
		normalizeArray: (
			value: any,
			dimensions: number,
		) => {
			if (dimensions <= 1) {
				// eslint-disable-next-line drizzle-internal/no-instanceof
				if (value instanceof Int32Array) {
					return Array.from(value) as any;
				}
				return value;
			}

			const stack: { arr: any; depth: number }[] = [{ arr: value, depth: 1 }];

			while (stack.length > 0) {
				const { arr, depth } = stack.pop()!;

				if (depth === dimensions - 1) {
					for (let i = 0; i < arr.length; i++) {
						const leaf = arr[i];
						// eslint-disable-next-line drizzle-internal/no-instanceof
						if (leaf instanceof Int32Array) {
							arr[i] = Array.from(leaf);
						}
					}
				} else {
					for (let i = 0; i < arr.length; i++) {
						stack.push({ arr: arr[i], depth: depth + 1 });
					}
				}
			}

			return value;
		},
		normalizeParamArray: makePgArray,
	},

	bit: { normalizeParamArray: makePgArray },
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
	json: {
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
	},
	jsonb: {
		normalizeParamArray: arrayCompatNormalizeInput((v) => JSON.stringify(v), true),
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
	numeric: { normalizeParamArray: makePgArray },
	'numeric:number': { normalizeParamArray: makePgArray },
	'numeric:bigint': { normalizeParamArray: makePgArray },
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
	halfvec: { normalizeParamArray: makePgArray },
	sparsevec: {
		normalizeArray: parsePgArray,
		normalizeParamArray: makePgArray,
	},
	vector: { normalizeParamArray: makePgArray },
});

export class BunSQLDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<BunSQLQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'BunSQLDatabase';
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: SQL,
	config: DrizzlePgConfig<TRelations> = {},
): BunSQLDatabase<TRelations> & {
	$client: SQL;
} {
	client.options.bigint = true;
	const dialect = new PgDialect({
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? bunSqlPgCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new BunSQLSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new BunSQLDatabase(dialect, session, relations, false, true) as BunSQLDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends SQL = SQL,
>(
	...params: [
		string,
	] | [
		string,
		DrizzlePgConfig<TRelations>,
	] | [
		(
			& DrizzlePgConfig<TRelations>
			& ({
				connection: string | ({ url?: string } & SQL.Options);
			} | {
				client: TClient;
			})
		),
	]
): BunSQLDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new SQL(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzlePgConfig } = params[0] as
		& {
			connection?: { url?: string } & SQL.Options;
			client?: TClient;
		}
		& DrizzlePgConfig<TRelations>;

	if (client) return construct(client, DrizzlePgConfig) as any;

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;

		const instance = new SQL({ url, ...config });
		return construct(instance, DrizzlePgConfig) as any;
	}

	const instance = new SQL(connection);
	return construct(instance, DrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): BunSQLDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({
			options: {
				parsers: {},
				serializers: {},
			},
		} as any, config) as any;
	}
}
