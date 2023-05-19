import { DrizzleError, TransactionRollbackError } from '~/errors';
import { type TablesRelationalConfig } from '~/relations';
import type { Query, SQL } from '~/sql';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect';
import { BaseSQLiteDatabase } from './db';
import type { SelectedFieldsOrdered } from './query-builders/select.types';

export interface PreparedQueryConfig {
	type: 'sync' | 'async';
	run: unknown;
	all: unknown[];
	get: unknown;
	values: unknown[][];
}

export abstract class PreparedQuery<T extends PreparedQueryConfig> {
	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract run(placeholderValues?: Record<string, unknown>): Result<T['type'], T['run']>;

	abstract all(placeholderValues?: Record<string, unknown>): Result<T['type'], T['all']>;

	abstract get(placeholderValues?: Record<string, unknown>): Result<T['type'], T['get']>;

	abstract values(placeholderValues?: Record<string, unknown>): Result<T['type'], T['values']>;
}

export interface SQLiteTransactionConfig {
	behavior?: 'deferred' | 'immediate' | 'exclusive';
}

export abstract class SQLiteSession<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> {
	constructor(
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultKind],
	) {}

	abstract prepareQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
	): PreparedQuery<PreparedQueryConfig & { type: TResultKind }>;

	prepareOneTimeQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
	): PreparedQuery<PreparedQueryConfig & { type: TResultKind }> {
		return this.prepareQuery(query, fields);
	}

	abstract transaction<T>(
		transaction: (tx: SQLiteTransaction<TResultKind, TRunResult, TFullSchema, TSchema>) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T>;

	run(query: SQL): Result<TResultKind, TRunResult> {
		const staticQuery = this.dialect.sqlToQuery(query);
		try {
			return this.prepareOneTimeQuery(staticQuery, undefined).run();
		} catch (err) {
			throw DrizzleError.wrap(err, `Failed to run the query '${staticQuery.sql}'`);
		}
	}

	all<T = unknown>(query: SQL): Result<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined).all();
	}

	get<T = unknown>(query: SQL): Result<TResultKind, T> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined).get();
	}

	values<T extends any[] = unknown[]>(
		query: SQL,
	): Result<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined).values();
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

export type Result<TKind extends 'sync' | 'async', TResult> =
	(('sync' extends TKind ? SyncResultHKT : AsyncResultHKT) & {
		readonly config: TResult;
	})['type'];

export abstract class SQLiteTransaction<
	TResultType extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends BaseSQLiteDatabase<TResultType, TRunResult, TFullSchema, TSchema> {
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
