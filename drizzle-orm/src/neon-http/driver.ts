import type { HTTPQueryOptions, HTTPTransactionOptions, NeonQueryFunction } from '@neondatabase/serverless';
import { neon, types } from '@neondatabase/serverless';
import * as V1 from '~/_relations.ts';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type NeonHttpClient, type NeonHttpQueryResultHKT, NeonHttpSession } from './session.ts';

export interface NeonDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class NeonHttpDriver {
	static readonly [entityKind]: string = 'NeonHttpDriver';

	constructor(
		private client: NeonHttpClient,
		private dialect: PgDialect,
		private options: NeonDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(
		relations: AnyRelations | undefined,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): NeonHttpSession<Record<string, unknown>, EmptyRelations, V1.TablesRelationalConfig> {
		return new NeonHttpSession(this.client, this.dialect, relations ?? {} as EmptyRelations, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
		types.setTypeParser(types.builtins.INTERVAL, (val) => val);
		types.setTypeParser(1231, (val) => val);
		types.setTypeParser(1115, (val) => val);
		types.setTypeParser(1185, (val) => val);
		types.setTypeParser(1187, (val) => val);
		types.setTypeParser(1182, (val) => val);
	}
}

function wrap<T extends object>(
	target: T,
	token: Exclude<HTTPQueryOptions<true, true>['authToken'], undefined>,
	cb: (target: any, p: string | symbol, res: any) => any,
	deep?: boolean,
) {
	return new Proxy(target, {
		get(target, p) {
			const element = target[p as keyof typeof p];
			if (typeof element !== 'function' && (typeof element !== 'object' || element === null)) return element;

			if (deep) return wrap(element, token, cb);
			if (p === 'query' || p === '_query') return wrap(element, token, cb, true);

			if (p === 'execute') {
				return new Proxy(element as any, {
					apply(target, thisArg, argArray) {
						return target.call(thisArg, ...argArray, token);
					},
				});
			}

			return new Proxy(element as any, {
				apply(target, thisArg, argArray) {
					const res = target.call(thisArg, ...argArray);
					if (typeof res === 'object' && res !== null && 'setToken' in res && typeof res.setToken === 'function') {
						res.setToken(token);
					}
					return cb(target, p, res);
				},
			});
		},
	});
}

export class NeonHttpDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<NeonHttpQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'NeonHttpDatabase';

	$withAuth(
		token: Exclude<HTTPQueryOptions<true, true>['authToken'], undefined>,
	): Omit<
		this,
		Exclude<
			keyof this,
			| '$count'
			| 'delete'
			| 'select'
			| 'selectDistinct'
			| 'selectDistinctOn'
			| 'update'
			| 'insert'
			| 'with'
			| '_query'
			| 'query'
			| 'execute'
			| 'refreshMaterializedView'
		>
	> {
		return wrap(this, token, (target, p, res) => {
			if (p === 'with') {
				return wrap(res, token, (_, __, res) => res);
			}
			return res;
		});
	}

	/** @internal */
	declare readonly session: NeonHttpSession<
		TSchema,
		TRelations,
		V1.ExtractTablesWithRelations<TSchema>
	>;

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<any, any>,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): NeonHttpDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	const dialect = new PgDialect({ casing: config.casing });
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

	const driver = new NeonHttpDriver(client, dialect, { logger, cache: config.cache });
	const session = driver.createSession(relations, schema);

	const db = new NeonHttpDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<V1.ExtractTablesWithRelations<TSchema>> | undefined,
	);
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
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<false, false>,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | ({ connectionString: string } & HTTPTransactionOptions<boolean, boolean>);
			} | {
				client: TClient;
			})
		),
	]
): NeonHttpDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = neon(params[0] as string);
		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& {
			connection?:
				| ({
					connectionString: string;
				} & HTTPTransactionOptions<boolean, boolean>)
				| string;
			client?: TClient;
		}
		& DrizzleConfig<TSchema, TRelations>;

	if (client) return construct(client, drizzleConfig);

	if (typeof connection === 'object') {
		const { connectionString, ...options } = connection;

		const instance = neon(connectionString, options);

		return construct(instance, drizzleConfig) as any;
	}

	const instance = neon(connection!);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): NeonHttpDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
