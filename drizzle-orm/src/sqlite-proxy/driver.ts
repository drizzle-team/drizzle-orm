import { DefaultLogger } from '~/logger';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import { type DrizzleConfig } from '~/utils';
import { SQLiteRemoteSession } from './session';

export interface SqliteRemoteResult<T = unknown> {
	rows?: T[];
}

export type SqliteRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = BaseSQLiteDatabase<'async', SqliteRemoteResult, TSchema>;

export type AsyncRemoteCallback = (
	sql: string,
	params: any[],
	method: 'run' | 'all' | 'values' | 'get',
) => Promise<{ rows: any[] }>;

export type RemoteCallback = AsyncRemoteCallback;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	config: DrizzleConfig<TSchema> = {},
): SqliteRemoteDatabase<TSchema> {
	const dialect = new SQLiteAsyncDialect();
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

	const session = new SQLiteRemoteSession(callback, dialect, schema, { logger });
	return new BaseSQLiteDatabase('async', dialect, session, schema) as SqliteRemoteDatabase<TSchema>;
}
