import { entityKind } from '~/entity.ts';
import { DrizzleError, TransactionRollbackError } from '~/errors.ts';
import { type TablesRelationalConfig } from '~/relations.ts';
import type { Query, SQL } from '~/sql/index.ts';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { QueryPromise } from '../index.ts';
import { BaseSQLiteDatabase } from './db.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';
import type { SQLiteRaw } from './query-builders/raw.ts';

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

export abstract class PreparedQuery<T extends PreparedQueryConfig> {
	static readonly [entityKind]: string = 'PreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	constructor(
		private mode: 'sync' | 'async',
		private executeMethod: SQLiteExecuteMethod,
	) {}

	abstract run(placeholderValues?: Record<string, unknown>): Result<T['type'], T['run']>;

	abstract all(placeholderValues?: Record<string, unknown>): Result<T['type'], T['all']>;

	abstract get(placeholderValues?: Record<string, unknown>): Result<T['type'], T['get']>;

	abstract values(placeholderValues?: Record<string, unknown>): Result<T['type'], T['values']>;

	execute(placeholderValues?: Record<string, unknown>): ExecuteResult<T['type'], T['execute']> {
		if (this.mode === 'async') {
			return this[this.executeMethod](placeholderValues) as ExecuteResult<T['type'], T['execute']>;
		}
		return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues));
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
	): PreparedQuery<PreparedQueryConfig & { type: TResultKind }>;

	prepareOneTimeQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
	): PreparedQuery<PreparedQueryConfig & { type: TResultKind }> {
		return this.prepareQuery(query, fields, executeMethod);
	}

	abstract transaction<T>(
		transaction: (tx: SQLiteTransaction<TResultKind, TRunResult, TFullSchema, TSchema>) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T>;

	run(query: SQL): Result<TResultKind, TRunResult> {
		const staticQuery = this.dialect.sqlToQuery(query);
		try {
			return this.prepareOneTimeQuery(staticQuery, undefined, 'run').run();
		} catch (err) {
			throw DrizzleError.wrap(err, `Failed to run the query '${staticQuery.sql}'`);
		}
	}

	all<T = unknown>(query: SQL): Result<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run').all();
	}

	get<T = unknown>(query: SQL): Result<TResultKind, T> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run').get();
	}

	values<T extends any[] = unknown[]>(
		query: SQL,
	): Result<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run').values();
	}
}

interface ResultHKT {
	readonly $brand: 'SQLiteResultHKT';
	readonly config: unknown;
	readonly type: unknown;
}

interface SyncResultHKT extends ResultHKT {
	readonly type: this['config'];
}

interface AsyncResultHKT extends ResultHKT {
	readonly type: Promise<this['config']>;
}

interface DBAsyncResultHKT extends ResultHKT {
	readonly type: SQLiteRaw<this['config']>;
}

export type Result<TKind extends 'sync' | 'async', TResult> =
	(('sync' extends TKind ? SyncResultHKT : AsyncResultHKT) & {
		readonly config: TResult;
	})['type'];

export type DBResult<TKind extends 'sync' | 'async', TResult> =
	(('sync' extends TKind ? SyncResultHKT : DBAsyncResultHKT) & {
		readonly config: TResult;
	})['type'];

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
