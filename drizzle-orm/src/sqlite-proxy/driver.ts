import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from '~/relations.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { SQLiteRemoteSession } from './session.ts';

export interface SqliteRemoteResult<T = unknown> {
	rows?: T[];
}

export class SqliteRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'async', SqliteRemoteResult, TSchema> {
	static override readonly [entityKind]: string = 'SqliteRemoteDatabase';

	/** @internal */
	declare readonly session: SQLiteRemoteSession<TSchema, ExtractTablesWithRelations<TSchema>>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

export type AsyncRemoteCallback = (
	sql: string,
	params: any[],
	method: 'run' | 'all' | 'values' | 'get',
) => Promise<{ rows: any[] }>;

export type AsyncBatchRemoteCallback = (batch: {
	sql: string;
	params: any[];
	method: 'run' | 'all' | 'values' | 'get';
}[]) => Promise<{ rows: any[] }[]>;

export type RemoteCallback = AsyncRemoteCallback;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	config?: DrizzleConfig<TSchema>,
): SqliteRemoteDatabase<TSchema>;
export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	batchCallback?: AsyncBatchRemoteCallback,
	config?: DrizzleConfig<TSchema>,
): SqliteRemoteDatabase<TSchema>;
export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	batchCallback?: AsyncBatchRemoteCallback | DrizzleConfig<TSchema>,
	config?: DrizzleConfig<TSchema>,
): SqliteRemoteDatabase<TSchema> {
	const dialect = new SQLiteAsyncDialect({ casing: config?.casing });
	let logger;
	let cache;
	let _batchCallback: AsyncBatchRemoteCallback | undefined;
	let _config: DrizzleConfig<TSchema> = {};

	if (batchCallback) {
		if (typeof batchCallback === 'function') {
			_batchCallback = batchCallback as AsyncBatchRemoteCallback;
			_config = config ?? {};
		} else {
			_batchCallback = undefined;
			_config = batchCallback as DrizzleConfig<TSchema>;
		}

		if (_config.logger === true) {
			logger = new DefaultLogger();
		} else if (_config.logger !== false) {
			logger = _config.logger;
			cache = _config.cache;
		}
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (_config.schema) {
		const tablesConfig = extractTablesRelationalConfig(
			_config.schema,
			createTableRelationsHelpers,
		);
		schema = {
			fullSchema: _config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const session = new SQLiteRemoteSession(callback, dialect, schema, _batchCallback, { logger, cache });
	const db = new SqliteRemoteDatabase('async', dialect, session, schema) as SqliteRemoteDatabase<TSchema>;
	(<any> db).$cache = cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = cache?.onMutate;
	}
	return db;
}
