import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { SingleStoreDatabase } from '~/singlestore-core/db.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import {
	type SingleStoreRemotePreparedQueryHKT,
	type SingleStoreRemoteQueryResultHKT,
	SingleStoreRemoteSession,
} from './session.ts';

export type SingleStoreRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = SingleStoreDatabase<SingleStoreRemoteQueryResultHKT, SingleStoreRemotePreparedQueryHKT, TSchema>;

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
) => Promise<{ rows: any[]; insertId?: number; affectedRows?: number }>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	config: DrizzleConfig<TSchema> = {},
): SingleStoreRemoteDatabase<TSchema> {
	const dialect = new SingleStoreDialect();
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

	const session = new SingleStoreRemoteSession(callback, dialect, schema, { logger });
	return new SingleStoreDatabase(dialect, session, schema, 'default') as SingleStoreRemoteDatabase<TSchema>;
}
