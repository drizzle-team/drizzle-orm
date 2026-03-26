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
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { ExpoSQLiteAsyncSession } from './session.ts';

export class ExpoSQLiteAsyncDatabase<TSchema extends Record<string, unknown> = Record<string, never>>
	extends BaseSQLiteDatabase<'async', SQLiteRunResult, TSchema>
{
	static override readonly [entityKind]: string = 'ExpoSQLiteAsyncDatabase';
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: SQLiteDatabase,
	config: DrizzleConfig<TSchema> = {},
): ExpoSQLiteAsyncDatabase<TSchema> & {
	$client: SQLiteDatabase;
} {
	const dialect = new SQLiteAsyncDialect({ casing: config.casing });
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

	const session = new ExpoSQLiteAsyncSession(client, dialect, schema, { logger });
	const db = new ExpoSQLiteAsyncDatabase('async', dialect, session, schema) as ExpoSQLiteAsyncDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}
