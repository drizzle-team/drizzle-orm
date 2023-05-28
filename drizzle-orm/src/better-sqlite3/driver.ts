import type { Database, RunResult } from 'better-sqlite3';
import { DefaultLogger } from '~/logger';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import { type DrizzleConfig } from '~/utils';
import { BetterSQLiteSession } from './session';

export type BetterSQLite3Database<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = BaseSQLiteDatabase<'sync', RunResult, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Database,
	config: DrizzleConfig<TSchema> = {},
): BetterSQLite3Database<TSchema> {
	const dialect = new SQLiteSyncDialect();
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

	const session = new BetterSQLiteSession(client, dialect, schema, { logger });
	return new BaseSQLiteDatabase('sync', dialect, session, schema) as BetterSQLite3Database<TSchema>;
}
