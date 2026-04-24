import pg, { type Pool, type PoolConfig } from 'pg';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { parsePgArray } from '~/pg-core/array.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import {
	arrayCompatNormalize,
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
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { NodePgClient, NodePgQueryResultHKT } from './session.ts';
import { NodePgSession } from './session.ts';

export class NodePgDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<NodePgQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NodePgDatabase';
}

export const nodePgCodecs = refineGenericPgCodecs({
	bit: {
		normalizeArray: parsePgArray,
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
	geometry: {
		normalizeArray: parsePgArrayAndNormalize(parseGeometryXY),
	},
	'geometry:tuple': {
		normalizeArray: parsePgArrayAndNormalize(parseGeometryTuple),
	},
	interval: {
		castArray: castToTextArr,
	},
	// driver handles objects, other types need to be stringified
	json: {
		normalizeParam: (v) => typeof v === 'object' && !Array.isArray(v) ? v : JSON.stringify(v),
	},
	jsonb: {
		normalizeParam: (v) => typeof v === 'object' && !Array.isArray(v) ? v : JSON.stringify(v),
	},
	line: {
		cast: castToText,
		castArray: castToTextArr,
	},
	'line:tuple': {
		cast: castToText,
		castArray: castToTextArr,
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	point: {
		cast: castToText,
		castArray: castToTextArr,
	},
	'point:tuple': {
		cast: castToText,
		castArray: castToTextArr,
	},
	sparsevec: {
		normalizeArray: parsePgArray,
	},
});

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodePgClient = NodePgClient,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): NodePgDatabase<TRelations> & {
	$client: NodePgClient extends TClient ? Pool : TClient;
} {
	const dialect = new PgDialect({
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? nodePgCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {};
	const session = new NodePgSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});

	const db = new NodePgDatabase(
		dialect,
		session,
		relations,
	) as NodePgDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodePgClient = Pool,
>(
	...params:
		| [
			string,
		]
		| [
			string,
			DrizzlePgConfig<TRelations>,
		]
		| [
			& DrizzlePgConfig<TRelations>
			& ({
				client: TClient;
			} | {
				connection: string | PoolConfig;
			}),
		]
): NodePgDatabase<TRelations> & {
	$client: NodePgClient extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new pg.Pool({
			connectionString: params[0],
		});

		return construct(
			instance,
			params[1] as DrizzlePgConfig<TRelations> | undefined,
		) as any;
	}

	const { connection, client, ...drizzlePgCDrizzlePgConfig } = params[0] as (
		& ({ connection?: PoolConfig | string; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, drizzlePgCDrizzlePgConfig);

	const instance = typeof connection === 'string'
		? new pg.Pool({
			connectionString: connection,
		})
		: new pg.Pool(connection!);

	return construct(instance, drizzlePgCDrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): NodePgDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
