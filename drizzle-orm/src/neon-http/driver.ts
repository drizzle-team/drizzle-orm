import type { HTTPQueryOptions, HTTPTransactionOptions, NeonQueryFunction } from '@neondatabase/serverless';
import { neon, types } from '@neondatabase/serverless';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { parsePgArray } from '~/pg-core/array.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { castToText, castToTextArr, refineGenericPgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type NeonHttpQueryResultHKT, NeonHttpSession } from './session.ts';

export class NeonHttpDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgAsyncDatabase<NeonHttpQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'NeonHttpDatabase';

	/** @intenal */
	declare session: NeonHttpSession<TRelations>;

	$withAuth(
		token: Exclude<HTTPQueryOptions<true, true>['authToken'], undefined>,
	): Omit<this, '$withAuth'> {
		const session = new NeonHttpSession(this.session.client, this.dialect, this._.relations, {
			...this.session.options,
			authToken: token,
		});

		return new NeonHttpDatabase(this.dialect, session, this._.relations) as any;
	}

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

export const neonHttpCodecs = refineGenericPgCodecs({
	bit: {
		normalizeArray: parsePgArray,
	},
	bytea: {
		normalizeParam: String,
	},
	geometry: {
		normalizeArray: parsePgArray,
	},
	interval: {
		castArray: castToTextArr,
	},
	json: {
		normalizeParam: (v) => JSON.stringify(v),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
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

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<any, any>,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): NeonHttpDatabase<TRelations> & {
	$client: TClient;
} {
	const dialect = new PgDialect({
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? neonHttpCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;

	const session = new NeonHttpSession(client, dialect, relations ?? {} as EmptyRelations, {
		logger,
		cache: config.cache,
	});

	types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
	types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
	types.setTypeParser(types.builtins.DATE, (val) => val);
	types.setTypeParser(types.builtins.INTERVAL, (val) => val);
	types.setTypeParser(1231, (val) => val);
	types.setTypeParser(1115, (val) => val);
	types.setTypeParser(1185, (val) => val);
	types.setTypeParser(1187, (val) => val);
	types.setTypeParser(1182, (val) => val);

	const db = new NeonHttpDatabase(dialect, session, relations);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<false, false>,
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
				connection: string | ({ connectionString: string } & HTTPTransactionOptions<boolean, boolean>);
			} | {
				client: TClient;
			})
		),
	]
): NeonHttpDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = neon(params[0] as string);
		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzlePgConfig } = params[0] as
		& {
			connection?:
				| ({
					connectionString: string;
				} & HTTPTransactionOptions<boolean, boolean>)
				| string;
			client?: TClient;
		}
		& DrizzlePgConfig<TRelations>;

	if (client) return construct(client, DrizzlePgConfig);

	if (typeof connection === 'object') {
		const { connectionString, ...options } = connection;

		const instance = neon(connectionString, options);

		return construct(instance, DrizzlePgConfig) as any;
	}

	const instance = neon(connection!);

	return construct(instance, DrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): NeonHttpDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
