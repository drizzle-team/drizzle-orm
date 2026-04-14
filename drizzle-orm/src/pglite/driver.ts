import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { makePgArray } from '~/pg-core/array.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import {
	arrayCompatNormalize,
	castToText,
	castToTextArr,
	genericPgCodecs,
	refineGenericPgCodecs,
} from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { base64ToUint8Array } from '~/utils.ts';
import type { PgliteClient, PgliteQueryResultHKT } from './session.ts';
import { PgliteSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class PgliteDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PgliteQueryResultHKT, TRelations> {
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

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: PgliteClient,
	config: DrizzlePgConfig<TRelations> = {},
): PgliteDatabase<TRelations> & {
	$client: PgliteClient;
} {
	const dialect = new PgDialect({
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? pgliteCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new PgliteSession(client, dialect, relations, {
		logger,
		useJitMapper: config.useJitMappers ?? false,
		cache: config.cache,
	});
	const db = new PgliteDatabase(
		dialect,
		session,
		relations,
	) as PgliteDatabase<TRelations>;
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
			DrizzlePgConfig<TRelations>,
		]
		| [
			(
				& DrizzlePgConfig<TRelations>
				& ({
					connection?: (PGliteOptions & { dataDir?: string }) | string;
				} | {
					client: TClient;
				})
			),
		]
): PgliteDatabase<TRelations> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = new PGlite(params[0]);
		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzlePgConfig } = params[0] as
		& {
			connection?: PGliteOptions & { dataDir: string };
			client?: TClient;
		}
		& DrizzlePgConfig<TRelations>;

	if (client) return construct(client, DrizzlePgConfig) as any;

	if (typeof connection === 'object') {
		const { dataDir, ...options } = connection;

		const instance = new PGlite(dataDir, options);

		return construct(instance, DrizzlePgConfig) as any;
	}

	const instance = new PGlite(connection);

	return construct(instance, DrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PgliteDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
