/// <reference types="@cloudflare/workers-types" />
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { SQLiteDOSession } from './session.ts';

export class DrizzleSqliteDODatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'sync', SqlStorageCursor<Record<string, SqlStorageValue>>, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'DrizzleSqliteDODatabase';

	/** @internal */
	declare readonly session: SQLiteDOSession<
		TSchema,
		TRelations,
		V1.ExtractTablesWithRelations<TSchema>
	>;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends DurableObjectStorage = DurableObjectStorage,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): DrizzleSqliteDODatabase<TSchema, TRelations> & {
	$client: TClient;
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
	const session = new SQLiteDOSession(client as DurableObjectStorage, dialect, relations, schema, { logger });
	const db = new DrizzleSqliteDODatabase(
		'sync',
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
		false,
		true,
	) as DrizzleSqliteDODatabase<
		TSchema,
		TRelations
	>;
	(<any> db).$client = client;

	return db as any;
}
