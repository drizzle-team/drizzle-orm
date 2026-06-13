import type mssql from 'mssql';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/index.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { MsSqlDatabase } from '~/mssql-core/db.ts';
import { MsSqlDialect } from '~/mssql-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type DrizzleConfig, type Equal, jitCompatCheck } from '~/utils.ts';
import { AutoPool } from './pool.ts';
import type { NodeMsSqlClient, NodeMsSqlPreparedQueryHKT, NodeMsSqlQueryResultHKT } from './session.ts';
import { NodeMsSqlSession } from './session.ts';

export interface MsSqlDriverOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMappers?: boolean;
}

export class NodeMsSqlDriver {
	static readonly [entityKind]: string = 'NodeMsSqlDriver';

	constructor(
		private client: NodeMsSqlClient,
		private dialect: MsSqlDialect,
		private options: MsSqlDriverOptions = {},
	) {
	}

	createSession<TRelations extends AnyRelations>(
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
		relations: TRelations,
	): NodeMsSqlSession<Record<string, unknown>, V1.TablesRelationalConfig, TRelations> {
		return new NodeMsSqlSession(this.client, this.dialect, schema, relations, {
			logger: this.options.logger,
			cache: this.options.cache,
			useJitMappers: this.options.useJitMappers,
		});
	}
}

export { MsSqlDatabase } from '~/mssql-core/db.ts';

export type NodeMsSqlDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> = MsSqlDatabase<
	NodeMsSqlQueryResultHKT,
	NodeMsSqlPreparedQueryHKT,
	TSchema,
	V1.ExtractTablesWithRelations<TSchema>,
	TRelations
>;

export type NodeMsSqlDrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> =
	& Omit<DrizzleConfig<TSchema, TRelations>, 'schema'>
	& ({ schema: TSchema } | { schema?: undefined });

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodeMsSqlClient = NodeMsSqlClient,
>(
	client: TClient,
	config: NodeMsSqlDrizzleConfig<TSchema, TRelations> = {},
): NodeMsSqlDatabase<TSchema, TRelations> & {
	$client: Equal<TClient, NodeMsSqlClient> extends true ? AutoPool : TClient;
} {
	const dialect = new MsSqlDialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	if (isCallbackClient(client)) {
		client = client.promise() as any;
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
	const driver = new NodeMsSqlDriver(client as NodeMsSqlClient, dialect, {
		logger,
		cache: config.cache,
		useJitMappers: jitCompatCheck(config.jit),
	});
	const session = driver.createSession(schema, relations);
	const db = new MsSqlDatabase(dialect, session, schema, relations) as NodeMsSqlDatabase<TSchema, TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function getMsSqlConnectionParams(connectionString: string): mssql.config | string {
	try {
		const url = new URL(connectionString);
		return {
			user: url.username,
			password: url.password,
			server: url.hostname,
			port: Number.parseInt(url.port, 10),
			database: url.pathname.replace(/^\//, ''),
			options: {
				encrypt: url.searchParams.get('encrypt') === 'true',
				trustServerCertificate: url.searchParams.get('trustServerCertificate') === 'true',
			},
		};
	} catch {
		return connectionString;
	}
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodeMsSqlClient = AutoPool,
>(
	...params:
		| [
			string,
		]
		| [
			string,
			NodeMsSqlDrizzleConfig<TSchema, TRelations>,
		]
		| [
			(
				& NodeMsSqlDrizzleConfig<TSchema, TRelations>
				& ({
					connection: string;
				} | {
					client: TClient;
				})
			),
		]
): NodeMsSqlDatabase<TSchema, TRelations> & {
	$client: Equal<TClient, NodeMsSqlClient> extends true ? AutoPool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new AutoPool(getMsSqlConnectionParams(params[0]));

		return construct<TSchema, TRelations>(
			instance,
			params[1] as NodeMsSqlDrizzleConfig<TSchema, TRelations> | undefined,
		) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as (
		& ({ connection?: mssql.config | string; client?: TClient })
		& NodeMsSqlDrizzleConfig<TSchema, TRelations>
	);

	if (client) return construct<TSchema, TRelations, TClient>(client, drizzleConfig);

	const instance = typeof connection === 'string'
		? new AutoPool(getMsSqlConnectionParams(connection))
		: new AutoPool(connection!);

	return construct<TSchema, TRelations>(instance, drizzleConfig) as any;
}

interface CallbackClient {
	promise(): NodeMsSqlClient;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: NodeMsSqlDrizzleConfig<TSchema, TRelations>,
	): NodeMsSqlDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
