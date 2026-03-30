/// <reference types="bun-types" />

import { SQL } from 'bun';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import {
	arrayCompatNormalize,
	castToText,
	castToTextArr,
	type PgCodecs,
	refineGenericPgCodecs,
} from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { makePgArray } from '~/pg-core/utils/array.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { BunSQLQueryResultHKT } from './session.ts';
import { BunSQLSession } from './session.ts';

export const bunSqlPgCodecs = refineGenericPgCodecs({
	date: {
		cast: castToText,
		normalizeParamArray: makePgArray,
	},
	uuid: {
		castArray: castToTextArr,
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
	float4: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: Number,
		normalizeArray: arrayCompatNormalize(Number),
		normalizeParamArray: makePgArray,
	},
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
	json: {
		normalizeParam: undefined,
	},
	jsonb: {
		normalizeParam: undefined,
	},
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

	bit: {
		normalizeParamArray: makePgArray,
		normalizeArray: undefined,
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
	interval: {
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
});

export class BunSQLDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<BunSQLQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'BunSQLDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: SQL,
	config: DrizzleConfig<TSchema, TRelations> & { codecs?: PgCodecs } = {},
): BunSQLDatabase<TSchema, TRelations> & {
	$client: SQL;
} {
	const dialect = new PgDialect({
		casing: config.casing,
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? bunSqlPgCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

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
	const session = new BunSQLSession(client, dialect, relations, schema, {
		logger,
		cache: config.cache,
		useJitMapper: config.useJitMappers,
	});
	const db = new BunSQLDatabase(dialect, session, relations, schema as any) as BunSQLDatabase<
		TSchema,
		TRelations
	>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends SQL = SQL,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleConfig<TSchema, TRelations> & { codecs?: PgCodecs },
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
			& { codecs?: PgCodecs }
			& ({
				connection: string | ({ url?: string } & SQL.Options);
			} | {
				client: TClient;
			})
		),
	]
): BunSQLDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new SQL(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& {
			connection?: { url?: string } & SQL.Options;
			client?: TClient;
		}
		& DrizzleConfig<TSchema, TRelations>
		& { codecs?: PgCodecs };

	if (client) return construct(client, drizzleConfig) as any;

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;

		const instance = new SQL({ url, ...config });
		return construct(instance, drizzleConfig) as any;
	}

	const instance = new SQL(connection);
	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations> & { codecs?: PgCodecs },
	): BunSQLDatabase<TSchema, TRelations> & {
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
