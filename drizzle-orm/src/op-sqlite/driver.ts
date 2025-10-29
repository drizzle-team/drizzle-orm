import type { OPSQLiteConnection, QueryResult } from '@op-engineering/op-sqlite';
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
import { OPSQLiteSession } from './session.ts';

export class OPSQLiteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'async', QueryResult, TSchema> {
	static override readonly [entityKind]: string = 'OPSQLiteDatabase';
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: OPSQLiteConnection,
	config: DrizzleConfig<TSchema> = {},
): OPSQLiteDatabase<TSchema> & {
	$client: OPSQLiteConnection;
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

	const session = new OPSQLiteSession(client, dialect, schema, { logger, cache: config.cache });
	const db = new OPSQLiteDatabase('async', dialect, session, schema) as OPSQLiteDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
