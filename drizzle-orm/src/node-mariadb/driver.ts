import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import {
  createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type NodeMariaDbClient, type NodeMariaDbPreparedQueryHKT, type NodeMariaDbQueryResultHKT, NodeMariaDbSession } from './session.ts';
import type { MySqlDriverOptions } from '~/mysql2/driver.ts';

export class NodeMariaDbDriver {
	static readonly [entityKind]: string = 'NodeMariaDbDriver';

	constructor(
		private client: NodeMariaDbClient,
		private dialect: MySqlDialect,
		private options: MySqlDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NodeMariaDbSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NodeMariaDbSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export { MySqlDatabase } from '~/mysql-core/db.ts';

export type NodeMariaDbDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = MySqlDatabase<NodeMariaDbQueryResultHKT, NodeMariaDbPreparedQueryHKT, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: NodeMariaDbClient,
	config: DrizzleConfig<TSchema> = {},
): NodeMariaDbDatabase<TSchema> {
	const dialect = new MySqlDialect();
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
	return new MySqlDatabase(dialect, session, schema, 'planetscale') as NodeMariaDbDatabase<TSchema>;
}
