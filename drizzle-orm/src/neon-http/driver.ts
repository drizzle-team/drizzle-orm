import type { HTTPQueryOptions, HTTPTransactionOptions, NeonQueryFunction } from '@neondatabase/serverless';
import { neon, types } from '@neondatabase/serverless';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from '~/relations.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
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
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NeonHttpSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NeonHttpSession(this.client, this.dialect, schema, {
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
			if (p === 'query') return wrap(element, token, cb, true);

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
> extends PgDatabase<NeonHttpQueryResultHKT, TSchema> {
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
			| 'query'
			| 'execute'
			| 'refreshMaterializedView'
		>
	> {
		this.authToken = token;

		return wrap(this, token, (target, p, res) => {
			if (p === 'with') {
				return wrap(res, token, (_, __, res) => res);
			}
			return res;
		});
	}

	/** @internal */
	declare readonly session: NeonHttpSession<TSchema, ExtractTablesWithRelations<TSchema>>;

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<any, any>,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NeonHttpDatabase<TSchema> & {
	$client: TClient;
} {
	const dialect = new PgDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(
			config.schema,
			createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const driver = new NeonHttpDriver(client, dialect, { logger, cache: config.cache });
	const session = driver.createSession(schema);

	const db = new NeonHttpDatabase(
		dialect,
		session,
		schema as RelationalSchemaConfig<ExtractTablesWithRelations<TSchema>> | undefined,
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
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<false, false>,
>(
	...params: [
		TClient | string,
	] | [
		TClient | string,
		DrizzleConfig<TSchema>,
	] | [
		(
			& DrizzleConfig<TSchema>
			& ({
				connection: string | ({ connectionString: string } & HTTPTransactionOptions<boolean, boolean>);
			} | {
				client: TClient;
			})
		),
	]
): NeonHttpDatabase<TSchema> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = neon(params[0] as string);
		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& {
				connection?:
					| ({
						connectionString: string;
					} & HTTPTransactionOptions<boolean, boolean>)
					| string;
				client?: TClient;
			}
			& DrizzleConfig<TSchema>;

		if (client) return construct(client, drizzleConfig);

		if (typeof connection === 'object') {
			const { connectionString, ...options } = connection;

			const instance = neon(connectionString, options);

			return construct(instance, drizzleConfig) as any;
		}

		const instance = neon(connection!);

		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): NeonHttpDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
