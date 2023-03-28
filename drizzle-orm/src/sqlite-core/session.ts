import type { Query, SQL } from '~/sql';
import type { SQLiteDialect } from '~/sqlite-core/dialect';
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

	abstract run(placeholderValues?: Record<string, unknown>): ResultKind<T['type'], T['run']>;

	abstract all(placeholderValues?: Record<string, unknown>): ResultKind<T['type'], T['all']>;

	abstract get(placeholderValues?: Record<string, unknown>): ResultKind<T['type'], T['get']>;

	abstract values(placeholderValues?: Record<string, unknown>): ResultKind<T['type'], T['values']>;
}

export abstract class SQLiteSession<TResultKind extends 'sync' | 'async' = 'sync' | 'async', TRunResult = unknown> {
	constructor(protected dialect: SQLiteDialect) {
	}

	abstract prepareQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
	): PreparedQuery<PreparedQueryConfig & { type: TResultKind }>;

	prepareOneTimeQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
	): PreparedQuery<PreparedQueryConfig & { type: TResultKind }> {
		return this.prepareQuery(query, fields);
	}

	abstract exec(
		query: string,
	): void;

	run(query: SQL): ResultKind<TResultKind, TRunResult> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined).run();
	}

	all<T = unknown>(query: SQL): ResultKind<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined).all();
	}

	get<T = unknown>(query: SQL): ResultKind<TResultKind, T> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined).get();
	}

	values<T extends any[] = unknown[]>(query: SQL): ResultKind<TResultKind, T[]> {
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

export type ResultKind<TType extends 'sync' | 'async', TResult> =
	(('sync' extends TType ? SyncResultHKT : AsyncResultHKT) & {
		readonly config: TResult;
	})['type'];
