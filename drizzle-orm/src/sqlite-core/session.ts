import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { fillPlaceholders, type Query, type SQL } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { assertUnreachable } from '~/utils.ts';
import { BaseSQLiteDatabase } from './db.ts';
import type { SQLiteRaw } from './query-builders/raw.ts';

export type SQLiteQueryExecutors<TType extends 'sync' | 'async'> = Record<
	SQLiteExecuteMethod,
	(params: unknown[]) => Result<TType, any>
>;

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

export class SQLitePreparedQuery<T extends PreparedQueryConfig> implements PreparedQuery {
	static readonly [entityKind]: string = 'PreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;
	/** @internal */
	readonly executeMethod: SQLiteExecuteMethod;
	private fastPath: boolean;

	constructor(
		private resultKind: 'sync' | 'async',
		executeMethod: SQLiteExecuteMethod = 'all',
		protected executors: SQLiteQueryExecutors<T['type']>,
		protected query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		protected logger: Logger,
		// cache instance
		protected cache: Cache | undefined,
		// per query related metadata
		protected queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		protected cacheConfig: WithCacheConfig | undefined,
	) {
		this.mapper = mapper;
		this.executeMethod = executeMethod;

		// it means that no $withCache options were passed and it should be just enabled
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}

		this.fastPath = cacheConfig === undefined && (cache === undefined || is(cache, NoopCache));
	}

	/** @internal */
	protected async queryWithCache<T>(
		queryString: string,
		params: any[],
		query: () => Promise<T>,
	): Promise<T> {
		const cacheStrat = this.cache !== undefined && !is(this.cache, NoopCache)
			? await strategyFor(queryString, params, this.queryMetadata, this.cacheConfig)
			: { type: 'skip' as const };

		if (cacheStrat.type === 'skip') {
			return query().catch((e) => {
				throw new DrizzleQueryError(queryString, params, e as Error);
			});
		}

		const cache = this.cache!;

		// For mutate queries, we should query the database, wait for a response, and then perform invalidation
		if (cacheStrat.type === 'invalidate') {
			return Promise.all([
				query(),
				cache.onMutate({ tables: cacheStrat.tables }),
			]).then((res) => res[0]).catch((e) => {
				throw new DrizzleQueryError(queryString, params, e as Error);
			});
		}

		if (cacheStrat.type === 'try') {
			const { tables, key, isTag, autoInvalidate, config } = cacheStrat;
			const fromCache = await cache.get(
				key,
				tables,
				isTag,
				autoInvalidate,
			);

			if (fromCache === undefined) {
				const result = await query().catch((e) => {
					throw new DrizzleQueryError(queryString, params, e as Error);
				});
				// put actual key
				await cache.put(
					key,
					result,
					// make sure we send tables that were used in a query only if user wants to invalidate it on each write
					autoInvalidate ? tables : [],
					isTag,
					config,
				);
				// put flag if we should invalidate or not
				return result;
			}

			return fromCache as unknown as T;
		}

		assertUnreachable(cacheStrat);
	}

	run(placeholderValues: Record<string, unknown> = {}): Result<T['type'], T['run']> {
		const { query, logger, executors, fastPath, resultKind } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (resultKind === 'sync') {
			try {
				return (<SQLiteQueryExecutors<'sync'>> executors).run(params);
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}
		}

		return fastPath
			? (<SQLiteQueryExecutors<'async'>> executors).run(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, () => (<SQLiteQueryExecutors<'async'>> executors).run(params));
	}

	all(placeholderValues: Record<string, unknown> = {}): Result<T['type'], T['all']> {
		const { query, logger, executors, mapper, fastPath, resultKind } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (resultKind === 'sync') {
			let res: any;
			try {
				res = (<SQLiteQueryExecutors<'sync'>> executors).all(params);
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}

			if (!mapper) return res;
			return mapper(res);
		}

		const res = fastPath
			? (<SQLiteQueryExecutors<'async'>> executors).all(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, () => (<SQLiteQueryExecutors<'async'>> executors).all(params));
		if (!mapper) return res;

		return res.then((rows) => mapper(rows)) as Result<T['type'], T['all']>;
	}

	get(placeholderValues: Record<string, unknown> = {}): Result<T['type'], T['get']> {
		const { query, logger, executors, mapper, fastPath, resultKind } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (resultKind === 'sync') {
			let res: any;
			try {
				res = (<SQLiteQueryExecutors<'sync'>> executors).get(params);
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}

			if (!res) return undefined as Result<T['type'], T['get']>;
			if (!mapper) return res;

			return mapper([res])[0];
		}

		const res = fastPath
			? (<SQLiteQueryExecutors<'async'>> executors).get(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, () => (<SQLiteQueryExecutors<'async'>> executors).get(params));

		if (!mapper) return res;

		return res.then((row) => row ? mapper([row])[0] : undefined) as Result<T['type'], T['get']>;
	}

	values(placeholderValues: Record<string, unknown> = {}): Result<T['type'], T['values']> {
		const { query, logger, executors, fastPath, resultKind } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (resultKind === 'sync') {
			try {
				return (<SQLiteQueryExecutors<'sync'>> executors).values(params);
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}
		}

		const res = fastPath
			? (<SQLiteQueryExecutors<'async'>> executors).values(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, () => (<SQLiteQueryExecutors<'async'>> executors).values(params));

		return res;
	}

	execute(placeholderValues?: Record<string, unknown>): ExecuteResult<T['type'], T['execute']> {
		if (this.resultKind === 'async') {
			return this[this.executeMethod](placeholderValues) as ExecuteResult<T['type'], T['execute']>;
		}
		return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues));
	}

	getQuery(): Query {
		return this.query;
	}
}

export interface SQLiteTransactionConfig {
	behavior?: 'deferred' | 'immediate' | 'exclusive';
}

export type SQLiteExecuteMethod = 'run' | 'all' | 'get' | 'values';

export abstract class SQLiteSession<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'SQLiteSession';

	constructor(
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultKind],
		readonly resultKind: TResultKind,
	) {}

	abstract prepareQuery(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): SQLitePreparedQuery<PreparedQueryConfig & { type: TResultKind }>;

	abstract transaction<T>(
		transaction: (
			tx: SQLiteTransaction<TResultKind, TRunResult, TRelations>,
		) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T>;

	run(query: SQL): Result<TResultKind, TRunResult> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'raw', false).run() as Result<
			TResultKind,
			TRunResult
		>;
	}

	objects<T = unknown>(query: SQL): Result<TResultKind, T[]> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'objects', false).all() as Result<
			TResultKind,
			T[]
		>;
	}

	object<T = unknown>(query: SQL): Result<TResultKind, T> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'objects', false).get() as Result<
			TResultKind,
			T
		>;
	}

	arrays<T extends any[] = unknown[]>(
		query: SQL,
	): Result<TResultKind, T[]> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'arrays', false).all() as Result<
			TResultKind,
			T[]
		>;
	}

	array<T extends any[] = unknown[]>(
		query: SQL,
	): Result<TResultKind, T> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'arrays', false).get() as Result<
			TResultKind,
			T
		>;
	}
}

export type Result<TKind extends 'sync' | 'async', TResult> = { sync: TResult; async: Promise<TResult> }[TKind];

export type DBResult<TKind extends 'sync' | 'async', TResult> = { sync: TResult; async: SQLiteRaw<TResult> }[TKind];

export abstract class SQLiteTransaction<
	TResultType extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<TResultType, TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteTransaction';

	constructor(
		resultType: TResultType,
		dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultType],
		session: SQLiteSession<TResultType, TRunResult, TRelations>,
		relations: TRelations,
		protected readonly nestedIndex = 0,
		rowModeRQB?: boolean,
		forbidJsonb?: boolean,
	) {
		super(resultType, dialect, session, relations, rowModeRQB, forbidJsonb);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}
}
