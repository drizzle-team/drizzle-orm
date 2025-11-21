import type mssql from 'mssql';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { MsSqlDatabase } from '~/mssql-core/db.ts';
import { MsSqlDialect } from '~/mssql-core/dialect.ts';
import type { DrizzleConfig, Equal } from '~/utils.ts';
import { AutoPool } from './pool.ts';
import type { NodeMsSqlClient, NodeMsSqlPreparedQueryHKT, NodeMsSqlQueryResultHKT } from './session.ts';
import { NodeMsSqlSession } from './session.ts';

export interface MsSqlDriverOptions {
	logger?: Logger;
}

export class NodeMsSqlDriver {
	static readonly [entityKind]: string = 'NodeMsSqlDriver';

	constructor(
		private client: NodeMsSqlClient,
		private dialect: MsSqlDialect,
		private options: MsSqlDriverOptions = {},
	) {
	}

	createSession(
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): NodeMsSqlSession<Record<string, unknown>, V1.TablesRelationalConfig> {
		return new NodeMsSqlSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export { MsSqlDatabase } from '~/mssql-core/db.ts';

export type NodeMsSqlDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = MsSqlDatabase<NodeMsSqlQueryResultHKT, NodeMsSqlPreparedQueryHKT, TSchema>;

export type NodeMsSqlDrizzleConfig<TSchema extends Record<string, unknown> = Record<string, never>> =
	& Omit<DrizzleConfig<TSchema>, 'schema'>
	& ({ schema: TSchema } | { schema?: undefined });

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodeMsSqlClient = NodeMsSqlClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NodeMsSqlDatabase<TSchema> & {
	$client: Equal<TClient, NodeMsSqlClient> extends true ? AutoPool : TClient;
} {
	const dialect = new MsSqlDialect({ casing: config.casing });
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

	const driver = new NodeMsSqlDriver(client as NodeMsSqlClient, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new MsSqlDatabase(dialect, session, schema) as NodeMsSqlDatabase<TSchema>;
	(<any> db).$client = client;

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
	TClient extends NodeMsSqlClient = AutoPool,
>(
	...params:
		| [
			string,
		]
		| [
			string,
			DrizzleConfig<TSchema>,
		]
		| [
			(
				& DrizzleConfig<TSchema>
				& ({
					connection: string;
				} | {
					client: TClient;
				})
			),
		]
): NodeMsSqlDatabase<TSchema> & {
	$client: Equal<TClient, NodeMsSqlClient> extends true ? AutoPool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new AutoPool(getMsSqlConnectionParams(params[0]));

		return construct(instance, params[1] as DrizzleConfig<TSchema> | undefined) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as (
		& ({ connection?: mssql.config | string; client?: TClient })
		& DrizzleConfig<TSchema>
	);

	if (client) return construct(client, drizzleConfig);

	const instance = typeof connection === 'string'
		? new AutoPool(getMsSqlConnectionParams(connection))
		: new AutoPool(connection!);

	return construct(instance, drizzleConfig) as any;
}

interface CallbackClient {
	promise(): NodeMsSqlClient;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): NodeMsSqlDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
