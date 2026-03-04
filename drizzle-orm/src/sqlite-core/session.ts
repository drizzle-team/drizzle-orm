import type * as V1 from '~/_relations.ts';
import { type Cache, hashQuery, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError, DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { BaseSQLiteDatabase } from './db.ts';
import type { SQLiteRaw } from './query-builders/raw.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface PreparedQueryConfig {
	type: 'sync' | 'async';
	run: unknown;
	all: unknown;
	get: unknown;
	values: unknown;
	execute: unknown;
}

export class ExecuteResultSync<T> extends QueryPromise<T> {
	static override readonly [entityKind]: string = 'ExecuteResultSync';

	constructor(private resultCb: () => T) {
		super();
	}

	override async execute(): Promise<T> {
		return this.resultCb();
	}

	sync(): T {
		return this.resultCb();
	}
}

export type ExecuteResult<TType extends 'sync' | 'async', TResult> = TType extends 'async' ? Promise<TResult>
	: ExecuteResultSync<TResult>;

export abstract class SQLitePreparedQuery<T extends PreparedQueryConfig> implements PreparedQuery {
	static readonly [entityKind]: string = 'PreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	constructor(
		private mode: 'sync' | 'async',
		private executeMethod: SQLiteExecuteMethod,
		protected query: Query,
		private cache?: Cache,
		// per query related metadata
		private queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		private cacheConfig?: WithCacheConfig,
	) {
		// it means that no $withCache options were passed and it should be just enabled
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}
	}

	/** @internal */
	protected async queryWithCache<T>(
		queryString: string,
		params: any[],
		query: () => Promise<T>,
	): Promise<T> {
		if (this.cache === undefined || is(this.cache, NoopCache) || this.queryMetadata === undefined) {
			try {
				return await query();
			} catch (e) {
				throw new DrizzleQueryError(queryString, params, e as Error);
			}
		}

		// don't do any mutations, if globally is false
		if (this.cacheConfig && !this.cacheConfig.enabled) {
			try {
				return await query();
			} catch (e) {
				throw new DrizzleQueryError(queryString, params, e as Error);
			}
		}

		// For mutate queries, we should query the database, wait for a response, and then perform invalidation
		if (
			(
				this.queryMetadata.type === 'insert' || this.queryMetadata.type === 'update'
				|| this.queryMetadata.type === 'delete'
			) && this.queryMetadata.tables.length > 0
		) {
			try {
				const [res] = await Promise.all([
					query(),
					this.cache.onMutate({ tables: this.queryMetadata.tables }),
				]);
				return res;
			} catch (e) {
				throw new DrizzleQueryError(queryString, params, e as Error);
			}
		}

		// don't do any reads if globally disabled
		if (!this.cacheConfig) {
			try {
				return await query();
			} catch (e) {
				throw new DrizzleQueryError(queryString, params, e as Error);
			}
		}

		if (this.queryMetadata.type === 'select') {
			const fromCache = await this.cache.get(
				this.cacheConfig.tag ?? await hashQuery(queryString, params),
				this.queryMetadata.tables,
				this.cacheConfig.tag !== undefined,
				this.cacheConfig.autoInvalidate,
			);
			if (fromCache === undefined) {
				let result;
				try {
					result = await query();
				} catch (e) {
					throw new DrizzleQueryError(queryString, params, e as Error);
				}

				// put actual key
				await this.cache.put(
					this.cacheConfig.tag ?? await hashQuery(queryString, params),
					result,
					// make sure we send tables that were used in a query only if user wants to invalidate it on each write
					this.cacheConfig.autoInvalidate ? this.queryMetadata.tables : [],
					this.cacheConfig.tag !== undefined,
					this.cacheConfig.config,
				);
				// put flag if we should invalidate or not
				return result;
			}

			return fromCache as unknown as T;
		}
		try {
			return await query();
		} catch (e) {
			throw new DrizzleQueryError(queryString, params, e as Error);
		}
	}

	getQuery(): Query {
		return this.query;
	}

	abstract run(placeholderValues?: Record<string, unknown>): Result<T['type'], T['run']>;

	mapRunResult(result: unknown, _isFromBatch?: boolean): unknown {
		return result;
	}

	abstract all(placeholderValues?: Record<string, unknown>): Result<T['type'], T['all']>;

	mapAllResult(_result: unknown, _isFromBatch?: boolean): unknown {
		throw new Error('Not implemented');
	}

	abstract get(placeholderValues?: Record<string, unknown>): Result<T['type'], T['get']>;

	mapGetResult(_result: unknown, _isFromBatch?: boolean): unknown {
		throw new Error('Not implemented');
	}

	abstract values(placeholderValues?: Record<string, unknown>): Result<T['type'], T['values']>;

	execute(placeholderValues?: Record<string, unknown>): ExecuteResult<T['type'], T['execute']> {
		if (this.mode === 'async') {
			return this[this.executeMethod](placeholderValues) as ExecuteResult<T['type'], T['execute']>;
		}
		return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues));
	}

	mapResult(response: unknown, isFromBatch?: boolean) {
		switch (this.executeMethod) {
			case 'run': {
				return this.mapRunResult(response, isFromBatch);
			}
			case 'all': {
				return this.mapAllResult(response, isFromBatch);
			}
			case 'get': {
				return this.mapGetResult(response, isFromBatch);
			}
		}
	}

	/** @internal */
	abstract isResponseInArrayMode(): boolean;
}

export interface SQLiteTransactionConfig {
	behavior?: 'deferred' | 'immediate' | 'exclusive';
}

export type SQLiteExecuteMethod = 'run' | 'all' | 'get';

export abstract class SQLiteSession<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'SQLiteSession';

	constructor(
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultKind],
	) {}

	abstract prepareQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): SQLitePreparedQuery<PreparedQueryConfig & { type: TResultKind }>;

	prepareOneTimeQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): SQLitePreparedQuery<PreparedQueryConfig & { type: TResultKind }> {
		return this.prepareQuery(
			query,
			fields,
			executeMethod,
			isResponseInArrayMode,
			customResultMapper,
			queryMetadata,
			cacheConfig,
		);
	}

	abstract prepareRelationalQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[], mapColumnValue?: (value: unknown) => unknown) => unknown,
	): SQLitePreparedQuery<PreparedQueryConfig & { type: TResultKind }>;

	prepareOneTimeRelationalQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[], mapColumnValue?: (value: unknown) => unknown) => unknown,
	): SQLitePreparedQuery<PreparedQueryConfig & { type: TResultKind }> {
		return this.prepareRelationalQuery(query, fields, executeMethod, customResultMapper);
	}

	abstract transaction<T>(
		transaction: (
			tx: SQLiteTransaction<TResultKind, TRunResult, TFullSchema, TRelations, TSchema>,
		) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T>;

	run(query: SQL): Result<TResultKind, TRunResult> {
		const staticQuery = this.dialect.sqlToQuery(query);
		try {
			return this.prepareOneTimeQuery(staticQuery, undefined, 'run', false).run() as Result<TResultKind, TRunResult>;
		} catch (err) {
			throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
		}
	}

	/** @internal */
	extractRawRunValueFromBatchResult(result: unknown) {
		return result;
	}

	all<T = unknown>(query: SQL): Result<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).all() as Result<
			TResultKind,
			T[]
		>;
	}

	/** @internal */
	extractRawAllValueFromBatchResult(_result: unknown): unknown {
		throw new Error('Not implemented');
	}

	get<T = unknown>(query: SQL): Result<TResultKind, T> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).get() as Result<
			TResultKind,
			T
		>;
	}

	/** @internal */
	extractRawGetValueFromBatchResult(_result: unknown): unknown {
		throw new Error('Not implemented');
	}

	values<T extends any[] = unknown[]>(
		query: SQL,
	): Result<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).values() as Result<
			TResultKind,
			T[]
		>;
	}

	async count(sql: SQL) {
		const result = await this.values(sql) as [[number]];

		return result[0][0];
	}

	/** @internal */
	extractRawValuesValueFromBatchResult(_result: unknown): unknown {
		throw new Error('Not implemented');
	}
}

export type Result<TKind extends 'sync' | 'async', TResult> = { sync: TResult; async: Promise<TResult> }[TKind];

export type DBResult<TKind extends 'sync' | 'async', TResult> = { sync: TResult; async: SQLiteRaw<TResult> }[TKind];

export abstract class SQLiteTransaction<
	TResultType extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> extends BaseSQLiteDatabase<TResultType, TRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SQLiteTransaction';

	constructor(
		resultType: TResultType,
		dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultType],
		session: SQLiteSession<TResultType, TRunResult, TFullSchema, TRelations, TSchema>,
		protected relations: TRelations,
		protected schema: {
			fullSchema: Record<string, unknown>;
			schema: TSchema;
			tableNamesMap: Record<string, string>;
		} | undefined,
		protected readonly nestedIndex = 0,
		rowModeRQB?: boolean,
		forbidJsonb?: boolean,
	) {
		super(resultType, dialect, session, relations, schema, rowModeRQB, forbidJsonb);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}
}
