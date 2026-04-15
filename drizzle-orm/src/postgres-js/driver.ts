import pgClient, { type Options, type PostgresType, type Sql } from 'postgres';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { makePgArray } from '~/pg-core/array.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { refineGenericPgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { PostgresJsQueryResultHKT } from './session.ts';
import { PostgresJsSession } from './session.ts';

export class PostgresJsDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgAsyncDatabase<PostgresJsQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'PostgresJsDatabase';
}

export const postgresJsCodecs = refineGenericPgCodecs({
	interval: {
		castArray: undefined,
		normalizeParamArray: makePgArray,
	},
	point: {
		cast: undefined,
		castArray: undefined,
		castInJson: undefined,
		castArrayInJson: undefined,
		normalizeParamArray: makePgArray,
	},
	line: {
		cast: undefined,
		castArray: undefined,
		castInJson: undefined,
		castArrayInJson: undefined,
		normalizeParamArray: makePgArray,
	},
	macaddr8: {
		castArray: undefined,
		castArrayInJson: undefined,
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
		normalizeArray: undefined,
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
		normalizeArray: undefined,
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
		normalizeArray: undefined,
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
		normalizeArray: undefined,
		normalizeParamArray: makePgArray,
	},
	numeric: {
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
	date: {
		normalizeParamArray: makePgArray,
	},
	timestamp: {
		normalizeParamArray: makePgArray,
	},
	timestamptz: {
		normalizeParamArray: makePgArray,
	},
});

function construct<
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: Sql,
	config: DrizzlePgConfig<TRelations> = {},
): PostgresJsDatabase<TRelations> & {
	$client: Sql;
} {
	const transparentParser = (val: any) => val;

	// Override postgres.js default date parsers: https://github.com/porsager/postgres/discussions/761
	for (const type of ['1184', '1082', '1083', '1114', '1182', '1185', '1115', '1231']) {
		client.options.parsers[type as any] = transparentParser;
		client.options.serializers[type as any] = transparentParser;
	}
	client.options.serializers['114'] = transparentParser;
	client.options.serializers['3802'] = transparentParser;

	const dialect = new PgDialect({
		casing: config.casing,
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? postgresJsCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new PostgresJsSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new PostgresJsDatabase(dialect, session, relations);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Sql = Sql,
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
				connection: string | ({ url?: string } & Options<Record<string, PostgresType>>);
			} | {
				client: TClient;
			})
		),
	]
): PostgresJsDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = pgClient(params[0] as string);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzlePgConfig } = params[0] as {
		connection?: { url?: string } & Options<Record<string, PostgresType>>;
		client?: TClient;
	} & DrizzlePgConfig<TRelations>;

	if (client) return construct(client, DrizzlePgConfig) as any;

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;

		const instance = pgClient(url, config);
		return construct(instance, DrizzlePgConfig) as any;
	}

	const instance = pgClient(connection);
	return construct(instance, DrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PostgresJsDatabase<TRelations> & {
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
