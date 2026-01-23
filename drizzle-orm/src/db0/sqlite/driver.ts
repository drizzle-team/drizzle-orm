import type { Database } from 'db0';
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
import { type Db0RunResult, Db0SQLiteSession, type Db0SQLiteSessionOptions } from './session.ts';

export class Db0SQLiteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'async', Db0RunResult, TSchema> {
	static override readonly [entityKind]: string = 'Db0SQLiteDatabase';
}

export function constructSqlite<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Database,
	config: DrizzleConfig<TSchema> = {},
): Db0SQLiteDatabase<TSchema> & { $client: Database } {
	const dialect = new SQLiteAsyncDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const sessionOptions: Db0SQLiteSessionOptions = { logger, cache: config.cache };
	const session = new Db0SQLiteSession(client, dialect, schema, sessionOptions);
	const db = new Db0SQLiteDatabase('async', dialect, session, schema) as Db0SQLiteDatabase<TSchema>;
	(<any>db).$client = client;

	return db as any;
}
