import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { makePgArray, parsePgArray } from '~/pg-core/array.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import {
	arrayCompatNormalize,
	castToText,
	castToTextArr,
	genericPgCodecs,
	parseGeometryTuple,
	parseGeometryXY,
	parsePgArrayAndNormalize,
	refineGenericPgCodecs,
	textToDate,
	textToDateWithTz,
} from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { base64ToUint8Array } from '~/utils.ts';
import type { PgliteClient, PgliteQueryResultHKT } from './session.ts';
import { PgliteSession } from './session.ts';

export class PgliteDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PgliteQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PgliteDatabase';
}

export const pgliteCodecs = refineGenericPgCodecs({
	// Otherwise outputs are inconsistent
	bigint: {
		cast: castToText,
		castArray: castToTextArr,
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
	},
	// Otherwise outputs are inconsistent
	'bigint:string': {
		cast: castToText,
		castArray: castToTextArr,
	},
	// Otherwise outputs are inconsistent
	'bigint:number': {
		cast: castToText,
		castArray: castToTextArr,
	},
	// Otherwise outputs are inconsistent
	bigserial: {
		normalize: BigInt,
		normalizeArray: arrayCompatNormalize(BigInt),
		cast: castToText,
		castArray: castToTextArr,
	},
	// Otherwise outputs are inconsistent
	'bigserial:number': {
		cast: castToText,
		castArray: castToTextArr,
	},
	bytea: {
		normalizeInJson: typeof Buffer === 'undefined' ? base64ToUint8Array : genericPgCodecs.bytea?.normalizeInJson,
		normalizeArrayInJson: typeof Buffer === 'undefined'
			? arrayCompatNormalize(base64ToUint8Array)
			: genericPgCodecs.bytea?.normalizeArrayInJson,
		normalize: typeof Buffer === 'undefined'
			? undefined
			: (v: Uint8Array) => Buffer.from(v),
		normalizeArray: typeof Buffer === 'undefined'
			? undefined
			: arrayCompatNormalize((v: Uint8Array) => Buffer.from(v)),
	},
	interval: {
		castArray: castToTextArr,
	},
	date: {
		castArray: castToTextArr,
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
	},
	'date:string': {
		castArray: castToTextArr,
	},
	timestamp: {
		castArray: castToTextArr,
		normalize: textToDateWithTz,
		normalizeArray: arrayCompatNormalize(textToDateWithTz),
	},
	timestamptz: {
		castArray: castToTextArr,
		normalize: textToDate,
		normalizeArray: arrayCompatNormalize(textToDate),
	},
	'timestamp:string': {
		castArray: castToTextArr,
	},
	'timestamptz:string': {
		castArray: castToTextArr,
	},
	json: {
		// Driver handles objects, other types need to be stringified
		normalizeParam: (v) => typeof v === 'object' ? v : JSON.stringify(v),
	},
	jsonb: {
		// Driver handles objects, other types need to be stringified
		normalizeParam: (v) => typeof v === 'object' ? v : JSON.stringify(v),
	},
	geometry: {
		normalizeArray: parsePgArrayAndNormalize(parseGeometryXY),
		castParam: (name) => `${name}::geometry`,
		castArrayParam: (name, dimensions) => `${name}::geometry${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
	},
	'geometry:tuple': {
		normalizeArray: parsePgArrayAndNormalize(parseGeometryTuple),
		castParam: (name) => `${name}::geometry`,
		castArrayParam: (name, dimensions) => `${name}::geometry${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
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
		normalizeArray: parsePgArray,
		castParam: (name) => `${name}::sparsevec`,
		castArrayParam: (name, dimensions) => `${name}::sparsevec${'[]'.repeat(dimensions)}`,
		normalizeParamArray: makePgArray,
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
