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
import { type MySqlRemotePreparedQueryHKT, type MySqlRemoteQueryResultHKT, MySqlRemoteSession } from './session.ts';

export type MySqlRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = MySqlDatabase<MySqlRemoteQueryResultHKT, MySqlRemotePreparedQueryHKT, TSchema>;

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
) => Promise<{ rows: any[] }>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	config: DrizzleConfig<TSchema> = {},
): MySqlRemoteDatabase<TSchema> {
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

	const session = new MySqlRemoteSession(callback, dialect, schema, { logger });
	return new MySqlDatabase(dialect, session, schema, 'default') as MySqlRemoteDatabase<TSchema>;
}
