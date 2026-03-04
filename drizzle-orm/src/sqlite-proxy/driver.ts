import * as V1 from '~/_relations.ts';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { SQLiteRemoteSession } from './session.ts';

export interface SqliteRemoteResult<T = unknown> {
	rows?: T[];
}

export class SqliteRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'async', SqliteRemoteResult, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'SqliteRemoteDatabase';

	/** @internal */
	declare readonly session: SQLiteRemoteSession<
		TSchema,
		TRelations,
		V1.ExtractTablesWithRelations<TSchema>
	>;

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

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	callback: RemoteCallback,
	config?: DrizzleConfig<TSchema, TRelations>,
): SqliteRemoteDatabase<TSchema, TRelations>;
export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	callback: RemoteCallback,
	batchCallback?: AsyncBatchRemoteCallback,
	config?: DrizzleConfig<TSchema, TRelations>,
): SqliteRemoteDatabase<TSchema, TRelations>;
export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	callback: RemoteCallback,
	batchCallback?: AsyncBatchRemoteCallback | DrizzleConfig<TSchema, TRelations>,
	config?: DrizzleConfig<TSchema, TRelations>,
): SqliteRemoteDatabase<TSchema, TRelations> {
	const dialect = new SQLiteAsyncDialect({ casing: config?.casing });
	let logger;
	let cache;
	let _batchCallback: AsyncBatchRemoteCallback | undefined;
	let _config: DrizzleConfig<TSchema, TRelations> = {};

	if (batchCallback) {
		if (typeof batchCallback === 'function') {
			_batchCallback = batchCallback as AsyncBatchRemoteCallback;
			_config = config ?? {};
		} else {
			_batchCallback = undefined;
			_config = batchCallback as DrizzleConfig<TSchema, TRelations>;
		}

		if (_config.logger === true) {
			logger = new DefaultLogger();
		} else if (_config.logger !== false) {
			logger = _config.logger;
			cache = _config.cache;
		}
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (_config.schema) {
		const tablesConfig = V1.extractTablesRelationalConfig(
			_config.schema,
			V1.createTableRelationsHelpers,
		);
		schema = {
			fullSchema: _config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const relations = _config.relations ?? {} as TRelations;
	const session = new SQLiteRemoteSession(callback, dialect, relations, schema, _batchCallback, { logger, cache });
	const db = new SqliteRemoteDatabase(
		'async',
		dialect,
		session as SqliteRemoteDatabase<TSchema, TRelations>['session'],
		relations,
		schema as V1.RelationalSchemaConfig<any>,
		true,
	) as SqliteRemoteDatabase<
		TSchema,
		TRelations
	>;
	(<any> db).$cache = cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = cache?.onMutate;
	}
	return db;
}
