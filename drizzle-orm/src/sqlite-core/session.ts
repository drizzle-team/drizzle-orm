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
	constructor(
		/** @internal */
		public dialect: SQLiteDialect,
	) {}

	abstract prepareQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		tx: Transaction<TResultKind, TRunResult> | undefined,
	): PreparedQuery<PreparedQueryConfig & { type: TResultKind }>;

	prepareOneTimeQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		tx: Transaction<TResultKind, TRunResult> | undefined,
	): PreparedQuery<PreparedQueryConfig & { type: TResultKind }> {
		return this.prepareQuery(query, fields, tx);
	}

	// abstract batch(queries: SQL[]): ResultKind<TResultKind, TRunResult[]>;

	abstract transaction(
		transaction: (tx: Transaction<TResultKind, TRunResult>) => void | Promise<void>,
	): ResultKind<TResultKind, void>;

	run(query: SQL, tx?: Transaction<TResultKind, TRunResult>): ResultKind<TResultKind, TRunResult> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, tx).run();
	}

	all<T = unknown>(query: SQL, tx?: Transaction<TResultKind, TRunResult>): ResultKind<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, tx).all();
	}

	get<T = unknown>(query: SQL, tx?: Transaction<TResultKind, TRunResult>): ResultKind<TResultKind, T> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, tx).get();
	}

	values<T extends any[] = unknown[]>(
		query: SQL,
		tx?: Transaction<TResultKind, TRunResult>,
	): ResultKind<TResultKind, T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, tx).values();
	}
}

export abstract class Transaction<TResultKind extends 'sync' | 'async' = 'sync' | 'async', TRunResult = unknown> {
	constructor(protected session: SQLiteSession<TResultKind, TRunResult>) {}

	run(query: SQL): ResultKind<TResultKind, TRunResult> {
		return this.session.run(query, this);
	}

	all<T = unknown>(query: SQL): ResultKind<TResultKind, T[]> {
		return this.session.all(query, this);
	}

	get<T = unknown>(query: SQL): ResultKind<TResultKind, T> {
		return this.session.get(query, this);
	}

	values<T extends any[] = unknown[]>(query: SQL): ResultKind<TResultKind, T[]> {
		return this.session.values(query, this);
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
