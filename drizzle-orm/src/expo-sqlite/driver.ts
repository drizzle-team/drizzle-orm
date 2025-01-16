import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
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
import { ExpoSQLiteSession } from './session.ts';

export class ExpoSQLiteDatabase<TSchema extends Record<string, unknown> = Record<string, never>>
	extends BaseSQLiteDatabase<'sync', SQLiteRunResult, TSchema>
{
	static override readonly [entityKind]: string = 'ExpoSQLiteDatabase';
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: SQLiteDatabase,
	config: DrizzleConfig<TSchema> = {},
): ExpoSQLiteDatabase<TSchema> & {
	$client: SQLiteDatabase;
} {
	const dialect = new SQLiteSyncDialect({ casing: config.casing });
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

	const session = new ExpoSQLiteSession(client, dialect, schema, { logger });
	const db = new ExpoSQLiteDatabase('sync', dialect, session, schema) as ExpoSQLiteDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}
