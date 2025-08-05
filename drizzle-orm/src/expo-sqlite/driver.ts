import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { ExpoSQLiteSession } from './session.ts';

export class ExpoSQLiteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'sync', SQLiteRunResult, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'ExpoSQLiteDatabase';
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: SQLiteDatabase,
	config: DrizzleConfig<TSchema, TRelations> = {},
): ExpoSQLiteDatabase<TSchema, TRelations> & {
	$client: SQLiteDatabase;
} {
	const dialect = new SQLiteSyncDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = V1.extractTablesRelationalConfig(
			config.schema,
			V1.createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new ExpoSQLiteSession(client, dialect, relations, schema, { logger });
	const db = new ExpoSQLiteDatabase(
		'sync',
		dialect,
		session as ExpoSQLiteDatabase<any, any>['session'],
		relations,
		schema,
	) as ExpoSQLiteDatabase<TSchema, TRelations>;
	(<any> db).$client = client;

	return db as any;
}
