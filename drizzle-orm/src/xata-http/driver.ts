import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { makePgArray } from '~/pg-core/array.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { refineGenericPgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { XataHttpClient, XataHttpQueryResultHKT } from './session.ts';
import { XataHttpSession } from './session.ts';

export interface XataDriverOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class XataHttpDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgAsyncDatabase<XataHttpQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'XataHttpDatabase';

	/** @internal */
	declare readonly session: XataHttpSession<TRelations>;
}

export const xataHttpCodecs = refineGenericPgCodecs({
	json: {
		normalizeParam: undefined,
		castParam: (name) => `${name}::json`,
	},
	jsonb: {
		normalizeParam: undefined,
		castParam: (name) => `${name}::jsonb`,
	},
	interval: {
		normalizeParamArray: makePgArray,
	},
	point: {
		normalizeParamArray: makePgArray,
	},
	line: {
		normalizeParamArray: makePgArray,
	},
	macaddr8: {
		normalizeParamArray: makePgArray,
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

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	client: XataHttpClient,
	config: DrizzlePgConfig<TRelations> = {},
): XataHttpDatabase<TRelations> & {
	$client: XataHttpClient;
} {
	const dialect = new PgDialect({
		casing: config.casing,
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? xataHttpCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new XataHttpSession(client, dialect, relations ?? {} as EmptyRelations, {
		logger,
		useJitMapper: config.useJitMappers ?? false,
		cache: config.cache,
	});

	const db = new XataHttpDatabase(
		dialect,
		session,
		relations,
	);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
