import { sql } from '@vercel/postgres';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { parsePgArray } from '~/pg-core/array.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { castToText, castToTextArr, refineGenericPgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { isConfig } from '~/utils.ts';
import { type VercelPgClient, type VercelPgQueryResultHKT, VercelPgSession } from './session.ts';

export class VercelPgDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgAsyncDatabase<VercelPgQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'VercelPgDatabase';
}

export const vercelPgCodecs = refineGenericPgCodecs({
	bit: {
		normalizeArray: parsePgArray,
	},
	geometry: {
		normalizeArray: parsePgArray,
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
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		cast: castToText,
		castArray: castToTextArr,
	},
	macaddr8: {
		castArrayInJson: castToTextArr,
		castArray: castToTextArr,
	},
	point: {
		castInJson: castToText,
		castArrayInJson: castToTextArr,
		cast: castToText,
		castArray: castToTextArr,
	},
	halfvec: {
		normalizeArray: parsePgArray,
	},
	sparsevec: {
		normalizeArray: parsePgArray,
	},
	vector: {
		normalizeArray: parsePgArray,
	},
});

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: VercelPgClient,
	config: DrizzlePgConfig<TRelations> = {},
): VercelPgDatabase<TRelations> & {
	$client: VercelPgClient;
} {
	const dialect = new PgDialect({
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? vercelPgCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new VercelPgSession(client, dialect, relations ?? {} as EmptyRelations, {
		logger,
		cache: config.cache,
	});
	const db = new VercelPgDatabase(
		dialect,
		session,
		relations,
	) as VercelPgDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends VercelPgClient = typeof sql,
>(
	...params: [] | [
		TClient,
	] | [
		TClient,
		DrizzlePgConfig<TRelations>,
	] | [
		(
			& DrizzlePgConfig<TRelations>
			& ({
				client?: TClient;
			})
		),
	]
): VercelPgDatabase<TRelations> & {
	$client: VercelPgClient extends TClient ? typeof sql : TClient;
} {
	if (isConfig(params[0])) {
		const { client, ...DrizzlePgConfig } = params[0] as ({ client?: TClient } & DrizzlePgConfig<TRelations>);
		return construct(client ?? sql, DrizzlePgConfig) as any;
	}

	return construct(
		(params[0] ?? sql) as TClient,
		params[1] as DrizzlePgConfig<TRelations> | undefined,
	) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): VercelPgDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
