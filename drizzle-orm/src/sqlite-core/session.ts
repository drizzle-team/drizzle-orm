import { entityKind } from '~/entity.ts';
import { DrizzleError, TransactionRollbackError } from '~/errors.ts';
import type { TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { QueryPromise } from '../index.ts';
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
	static readonly [entityKind]: string = 'ExecuteResultSync';

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
	) {}

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
}

export interface SQLiteTransactionConfig {
	behavior?: 'deferred' | 'immediate' | 'exclusive';
}

export type SQLiteExecuteMethod = 'run' | 'all' | 'get';

export abstract class SQLiteSession<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
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
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
	): SQLitePreparedQuery<PreparedQueryConfig & { type: TResultKind }>;

	prepareOneTimeQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
	): SQLitePreparedQuery<PreparedQueryConfig & { type: TResultKind }> {
		return this.prepareQuery(query, fields, executeMethod);
	}

	abstract transaction<T>(
		transaction: (tx: SQLiteTransaction<TResultKind, TRunResult, TFullSchema, TSchema>) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T>;

	run(query: SQL): Result<TResultKind, TRunResult> {
		const staticQuery = this.dialect.sqlToQuery(query);
		try {
			return this.prepareOneTimeQuery(staticQuery, undefined, 'run').run() as Result<TResultKind, TRunResult>;
		} catch (err) {
			throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
		}
	}

	/** @internal */
	extractRawRunValueFromBatchResult(result: unknown) {
		return result;
	}

	all<T = unknown>(query: SQL): Result<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run').all() as Result<TResultKind, T[]>;
	}

	/** @internal */
	extractRawAllValueFromBatchResult(_result: unknown): unknown {
		throw new Error('Not implemented');
	}

	get<T = unknown>(query: SQL): Result<TResultKind, T> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run').get() as Result<TResultKind, T>;
	}

	/** @internal */
	extractRawGetValueFromBatchResult(_result: unknown): unknown {
		throw new Error('Not implemented');
	}

	values<T extends any[] = unknown[]>(
		query: SQL,
	): Result<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run').values() as Result<
			TResultKind,
			T[]
		>;
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
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends BaseSQLiteDatabase<TResultType, TRunResult, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'SQLiteTransaction';

	constructor(
		resultType: TResultType,
		dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultType],
		session: SQLiteSession<TResultType, TRunResult, TFullSchema, TSchema>,
		protected schema: {
			fullSchema: Record<string, unknown>;
			schema: TSchema;
			tableNamesMap: Record<string, string>;
		} | undefined,
		protected readonly nestedIndex = 0,
	) {
		super(resultType, dialect, session, schema);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}
}
