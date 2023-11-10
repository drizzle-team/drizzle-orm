/// <reference types="@cloudflare/workers-types" />
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
import { SQLiteD1Session } from './session.ts';

export class DrizzleD1Database<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'async', D1Result, TSchema> {
	static readonly [entityKind]: string = 'LibSQLDatabase';

	/** @internal */
	declare readonly session: SQLiteD1Session<TSchema, ExtractTablesWithRelations<TSchema>>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

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
	return new DrizzleD1Database('async', dialect, session, schema) as DrizzleD1Database<TSchema>;
}
