import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import {
	arrayCompatNormalize,
	castToText,
	castToTextArr,
	genericPgCodecs,
	type PgCodecs,
	refineGenericPgCodecs,
} from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { makePgArray } from '~/pg-core/index.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { base64ToUint8Array, type DrizzleConfig } from '~/utils.ts';
import type { PgliteClient, PgliteQueryResultHKT } from './session.ts';
import { PgliteSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class PgliteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PgliteQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'PgliteDatabase';
}

export const pgliteCodecs = refineGenericPgCodecs({
	bigint: {
		cast: castToText,
		castArray: castToTextArr,
	},
	bigserial: {
		cast: castToText,
		castArray: castToTextArr,
	},
	bytea: {
		normalizeInJson: typeof Buffer === 'undefined' ? base64ToUint8Array : genericPgCodecs.bytea?.normalizeInJson,
		normalizeArrayInJson: typeof Buffer === 'undefined'
			? arrayCompatNormalize(base64ToUint8Array)
			: genericPgCodecs.bytea?.normalizeArrayInJson,
		normalize: typeof Buffer === 'undefined'
			? genericPgCodecs.bytea?.normalize
			: (v: Uint8Array) => Buffer.from(v),
		normalizeArray: typeof Buffer === 'undefined'
			? genericPgCodecs.bytea?.normalizeArray
			: arrayCompatNormalize((v: Uint8Array) => Buffer.from(v)),
	},
	json: {
		normalizeParam: (v) => typeof v === 'object' ? v : JSON.stringify(v),
	},
	jsonb: {
		normalizeParam: (v) => typeof v === 'object' ? v : JSON.stringify(v),
	},
	geometry: {
		castParam: (name) => `${name}::geometry`,
		castArrayParam: (name, dimensions) => `${name}::geometry${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
	bit: {
		normalizeArray: undefined,
	},
	halfvec: {
		castParam: (name) => `${name}::halfvec`,
		castArrayParam: (name, dimensions) => `${name}::halfvec${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
	vector: {
		castParam: (name) => `${name}::vector`,
		castArrayParam: (name, dimensions) => `${name}::vector${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
	sparsevec: {
		castParam: (name) => `${name}::sparsevec`,
		castArrayParam: (name, dimensions) => `${name}::sparsevec${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
	point: {
		cast: undefined,
		castArray: undefined,
		castInJson: undefined,
		castArrayInJson: undefined,
	},
	line: {
		cast: undefined,
		castArray: undefined,
		castInJson: undefined,
		castArrayInJson: undefined,
	},
	macaddr8: {
		castArrayInJson: undefined,
		castArray: undefined,
	},
});

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: PgliteClient,
	config: DrizzleConfig<TSchema, TRelations> & { codecs?: PgCodecs } = {},
): PgliteDatabase<TSchema, TRelations> & {
	$client: PgliteClient;
} {
	const dialect = new PgDialect({
		casing: config.casing,
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? pgliteCodecs,
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
	const session = new PgliteSession(client, dialect, relations, schema, {
		logger,
		useJitMapper: config.useJitMappers ?? false,
		cache: config.cache,
	});
	const db = new PgliteDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as PgliteDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	// (<any> db).$cache = { invalidate: (<any> config).cache?.onMutate };
	// if (config.cache) {
	// 	for (
	// 		const key of Object.getOwnPropertyNames(Object.getPrototypeOf(config.cache)).filter((key) =>
	// 			key !== 'constructor'
	// 		)
	// 	) {
	// 		(<any> db).$cache[key as keyof typeof config.cache] = (<any> config).cache[key];
	// 	}
	// }

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PGlite = PGlite,
>(
	...params:
		| []
		| [
			string,
		]
		| [
			string,
			DrizzleConfig<TSchema, TRelations> & { codecs?: PgCodecs },
		]
		| [
			(
				& DrizzleConfig<TSchema, TRelations>
				& { codecs?: PgCodecs }
				& ({
					connection?: (PGliteOptions & { dataDir?: string }) | string;
				} | {
					client: TClient;
				})
			),
		]
): PgliteDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = new PGlite(params[0]);
		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& {
			connection?: PGliteOptions & { dataDir: string };
			client?: TClient;
		}
		& DrizzleConfig<TSchema, TRelations>
		& { codecs?: PgCodecs };

	if (client) return construct(client, drizzleConfig) as any;

	if (typeof connection === 'object') {
		const { dataDir, ...options } = connection;

		const instance = new PGlite(dataDir, options);

		return construct(instance, drizzleConfig) as any;
	}

	const instance = new PGlite(connection);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations> & { codecs?: PgCodecs },
	): PgliteDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
