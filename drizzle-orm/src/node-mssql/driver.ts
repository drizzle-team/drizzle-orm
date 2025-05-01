import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { MsSqlDatabase } from '~/mssql-core/db.ts';
import { MsSqlDialect } from '~/mssql-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
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
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NodeMsSqlSession<Record<string, unknown>, TablesRelationalConfig> {
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

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodeMsSqlClient = NodeMsSqlClient,
>(
	client: NodeMsSqlClient,
	config: NodeMsSqlDrizzleConfig<TSchema> = {},
): NodeMsSqlDatabase<TSchema> & {
	$client: TClient;
} {
	const dialect = new MsSqlDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	if (isCallbackClient(client)) {
		client = client.promise();
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

	const driver = new NodeMsSqlDriver(client as NodeMsSqlClient, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new MsSqlDatabase(dialect, session, schema) as NodeMsSqlDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

interface CallbackClient {
	promise(): NodeMsSqlClient;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, unknown>>(
		config?: NodeMsSqlDrizzleConfig<TSchema>,
	):
		& NodeMsSqlDatabase<TSchema>
		& { $client: '$client is not available on drizzle.mock()' }
	{
		return drizzle({} as NodeMsSqlClient, config) as any;
	}
}
