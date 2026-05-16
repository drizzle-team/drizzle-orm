import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { Logger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import {
	type NodeMariaDbClient,
	type NodeMariaDbPreparedQueryHKT,
	type NodeMariaDbQueryResultHKT,
	NodeMariaDbSession,
} from './session.ts';

export interface NodeMariaDbDriverOptions {
	logger?: Logger;
}

export class NodeMariaDbDriver {
	static readonly [entityKind]: string = 'NodeMariaDbDriver';

	constructor(
		private client: NodeMariaDbClient,
		private dialect: MySqlDialect,
		private options: NodeMariaDbDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NodeMariaDbSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NodeMariaDbSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export { MySqlDatabase } from '~/mysql-core/db.ts';

export class NodeMariaDbDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends MySqlDatabase<NodeMariaDbQueryResultHKT, NodeMariaDbPreparedQueryHKT, TSchema> {
	static override readonly [entityKind]: string = 'NodeMariaDbDatabase';
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: NodeMariaDbClient,
	config: DrizzleConfig<TSchema> = {},
): NodeMariaDbDatabase<TSchema> {
	const dialect = new MySqlDialect({ casing: config.casing });
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

	const driver = new NodeMariaDbDriver(client, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new NodeMariaDbDatabase(dialect, session, schema as any, 'planetscale') as NodeMariaDbDatabase<TSchema>;
	(<any> db).$client = client;

	return db;
}
