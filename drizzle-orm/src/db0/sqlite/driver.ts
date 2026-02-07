import type { Database } from 'db0';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type Db0RunResult, Db0SQLiteSession, type Db0SQLiteSessionOptions } from './session.ts';

export class Db0SQLiteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'async', Db0RunResult, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'Db0SQLiteDatabase';
}

export function constructSqlite<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: Database,
	config: DrizzleConfig<TSchema, TRelations> = {},
): Db0SQLiteDatabase<TSchema, TRelations> & { $client: Database } {
	const dialect = new SQLiteAsyncDialect({ casing: config.casing });
	let logger: Logger | undefined;
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
	const sessionOptions: Db0SQLiteSessionOptions = { logger, cache: config.cache };
	const session = new Db0SQLiteSession(client, dialect, relations, schema as any, sessionOptions);

	const db = new Db0SQLiteDatabase(
		'async',
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as Db0SQLiteDatabase<TSchema, TRelations>;

	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
