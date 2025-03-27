/// <reference types="@cloudflare/workers-types" />
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type ExtractTablesWithRelations,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { SQLiteDOSession } from './session.ts';

export class DrizzleSqliteDODatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'sync', SqlStorageCursor<Record<string, SqlStorageValue>>, TSchema> {
	static override readonly [entityKind]: string = 'DrizzleSqliteDODatabase';

	/** @internal */
	declare readonly session: SQLiteDOSession<TSchema, ExtractTablesWithRelations<TSchema>>;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends DurableObjectStorage = DurableObjectStorage,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): DrizzleSqliteDODatabase<TSchema> & {
	$client: TClient;
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

	const session = new SQLiteDOSession(client as DurableObjectStorage, dialect, schema, { logger });
	const db = new DrizzleSqliteDODatabase('sync', dialect, session, schema) as DrizzleSqliteDODatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}
