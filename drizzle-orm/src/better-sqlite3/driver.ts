import type { Database, RunResult } from 'better-sqlite3';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { BetterSQLiteSession } from './session.ts';

export class BetterSQLite3Database<TSchema extends Record<string, unknown>>
	extends BaseSQLiteDatabase<'sync', RunResult, TSchema>
{
	static readonly [entityKind]: string = 'BetterSQLite3Database';
}

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
	return new BetterSQLite3Database('sync', dialect, session, schema) as BetterSQLite3Database<TSchema>;
}
