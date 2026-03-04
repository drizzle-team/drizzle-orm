import type { OPSQLiteConnection, QueryResult } from '@op-engineering/op-sqlite';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { OPSQLiteSession } from './session.ts';

export class OPSQLiteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'async', QueryResult, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'OPSQLiteDatabase';
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: OPSQLiteConnection,
	config: DrizzleConfig<TSchema, TRelations> = {},
): OPSQLiteDatabase<TSchema, TRelations> & {
	$client: OPSQLiteConnection;
} {
	const dialect = new SQLiteAsyncDialect({ casing: config.casing });
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
	const session = new OPSQLiteSession(client, dialect, relations, schema, { logger, cache: config.cache });
	const db = new OPSQLiteDatabase(
		'async',
		dialect,
		session as OPSQLiteDatabase<Record<string, any>, AnyRelations>['session'],
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as OPSQLiteDatabase<
		TSchema,
		TRelations
	>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
