import { TransactionRollbackError } from '~/errors';
import { type Query, type SQL, sql } from '~/sql';
import { MySqlDatabase } from './db';
import type { MySqlDialect } from './dialect';
import type { SelectedFieldsOrdered } from './query-builders/select.types';

export interface QueryResultHKT {
	readonly $brand: 'MySqlQueryRowHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type QueryResultKind<TKind extends QueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class PreparedQuery<T extends PreparedQueryConfig> {
	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Promise<T['all']>;
}

export interface MySqlTransactionConfig {
	withConsistentSnapshot?: boolean;
	accessMode?: 'read only' | 'read write';
	isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
}

export abstract class MySqlSession<TQueryResult extends QueryResultHKT = QueryResultHKT> {
	constructor(protected dialect: MySqlDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
		).execute();
	}

	all<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<PreparedQueryConfig & { all: T[] }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
		).all();
	}

	abstract transaction<T>(
		transaction: (tx: MySqlTransaction<TQueryResult>) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T>;

	protected getSetTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.isolationLevel) {
			parts.push(`isolation level ${config.isolationLevel}`);
		}

		return parts.length ? sql.fromList(['set transaction ', parts.join(' ')]) : undefined;
	}

	protected getStartTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.withConsistentSnapshot) {
			parts.push('with consistent snapshot');
		}

		if (config.accessMode) {
			parts.push(config.accessMode);
		}

		return parts.length ? sql.fromList(['start transaction ', parts.join(' ')]) : undefined;
	}
}

export abstract class MySqlTransaction<TQueryResult extends QueryResultHKT> extends MySqlDatabase<TQueryResult> {
	constructor(dialect: MySqlDialect, session: MySqlSession, protected readonly nestedIndex = 0) {
		super(dialect, session);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<T>(transaction: (tx: MySqlTransaction<TQueryResult>) => Promise<T>): Promise<T>;
}
