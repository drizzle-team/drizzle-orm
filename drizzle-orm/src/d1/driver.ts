/// <reference types="@cloudflare/workers-types" />

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
import { SQLiteD1Session } from './session';

export type DrizzleD1Database<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = BaseSQLiteDatabase<'async', D1Result, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: D1Database,
	config: DrizzleConfig<TSchema> = {},
): DrizzleD1Database<TSchema> {
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

	const session = new SQLiteD1Session(client, dialect, schema, { logger });
	return new BaseSQLiteDatabase('async', dialect, session, schema) as DrizzleD1Database<TSchema>;
}
