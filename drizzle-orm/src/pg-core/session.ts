import { TransactionRollbackError } from '~/errors';
import { type Query, type SQL, sql } from '~/sql';
import { PgDatabase } from './db';
import type { PgDialect } from './dialect';
import type { SelectedFieldsOrdered } from './query-builders/select.types';

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

	/** @internal */
	abstract values(placeholderValues?: Record<string, unknown>): Promise<T['values']>;
}

export interface PgTransactionConfig {
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
	accessMode?: 'read only' | 'read write';
	deferrable?: boolean;
}

export abstract class PgSession<TQueryResult extends QueryResultHKT = QueryResultHKT> {
	constructor(protected dialect: PgDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		mapResults?: (result: unknown) => unknown,
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

	values<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<PreparedQueryConfig & { values: T[] }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
		).values();
	}

	abstract transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T>;
}

export abstract class PgTransaction<TQueryResult extends QueryResultHKT> extends PgDatabase<TQueryResult> {
	constructor(dialect: PgDialect, session: PgSession, protected readonly nestedIndex = 0) {
		super(dialect, session, undefined);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** @internal */
	getTransactionConfigSQL(config: PgTransactionConfig): SQL {
		const chunks: string[] = [];
		if (config.isolationLevel) {
			chunks.push(`isolation level ${config.isolationLevel}`);
		}
		if (config.accessMode) {
			chunks.push(config.accessMode);
		}
		if (typeof config.deferrable === 'boolean') {
			chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
		}
		return sql.raw(chunks.join(' '));
	}

	setTransaction(config: PgTransactionConfig): Promise<void> {
		return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
	}

	abstract override transaction<T>(transaction: (tx: PgTransaction<TQueryResult>) => Promise<T>): Promise<T>;
}

export interface QueryResultHKT {
	readonly $brand: 'QueryRowHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type QueryResultKind<TKind extends QueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
