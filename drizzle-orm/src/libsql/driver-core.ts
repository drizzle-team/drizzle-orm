import type { Client, ResultSet } from '@libsql/client';
import type { BatchItem, BatchResponse } from '~/batch.ts';
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
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { LibSQLSession } from './session.ts';

export class LibSQLDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'async', ResultSet, TSchema> {
	static override readonly [entityKind]: string = 'LibSQLDatabase';

	/** @internal */
	declare readonly session: LibSQLSession<TSchema, ExtractTablesWithRelations<TSchema>>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}

	/**
	 * Attach an external SQLite database file to this connection.
	 *
	 * Tables in the attached database can be queried using the schema prefix.
	 * Ensure the schema was defined with `sqliteSchema(name)` and included
	 * in the drizzle() configuration.
	 *
	 * @param schemaName - Schema name to use for queries (e.g., 'bronze')
	 * @param dbPath - Absolute or relative path to database file
	 *
	 * @example
	 * ```typescript
	 * const bronze = sqliteSchema('bronze');
	 * const messageSnapshot = bronze.table('message_snapshot', { ... });
	 *
	 * const db = drizzle(client, {
	 *   schema: { messageSnapshot, ...warehouseSchema }
	 * });
	 *
	 * await db.$attach('bronze', './bronze.db');
	 *
	 * // Now queries work
	 * await db.select().from(messageSnapshot).all();
	 * ```
	 */
	async $attach(schemaName: string, dbPath: string): Promise<void> {
		const sql = `ATTACH DATABASE '${dbPath}' AS ${schemaName}`;
		await (this as any).$client.execute(sql);
	}

	/**
	 * Detach a previously attached database.
	 *
	 * @param schemaName - Schema name to detach
	 */
	async $detach(schemaName: string): Promise<void> {
		const sql = `DETACH DATABASE ${schemaName}`;
		await (this as any).$client.execute(sql);
	}
}

/** @internal */
export function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(client: Client, config: DrizzleConfig<TSchema> = {}): LibSQLDatabase<TSchema> & {
	$client: Client;
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

	const session = new LibSQLSession(client, dialect, schema, { logger, cache: config.cache }, undefined);
	const db = new LibSQLDatabase('async', dialect, session, schema) as LibSQLDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	return db as any;
}
