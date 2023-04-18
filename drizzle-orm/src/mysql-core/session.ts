import { TransactionRollbackError } from '~/errors';
import { type Query, type SQL, sql } from '~/sql';
import { type Assume, type Equal } from '~/utils';
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
	iterator: unknown;
}

export interface PreparedQueryHKT {
	readonly $brand: 'MySqlPreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type PreparedQueryKind<
	TKind extends PreparedQueryHKT,
	TConfig extends PreparedQueryConfig,
	TAssume extends boolean = false,
> = Equal<TAssume, true> extends true ? Assume<(TKind & { readonly config: TConfig })['type'], PreparedQuery<TConfig>>
	: (TKind & { readonly config: TConfig })['type'];

export abstract class PreparedQuery<T extends PreparedQueryConfig> {
	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	abstract iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']>;
}

export interface MySqlTransactionConfig {
	withConsistentSnapshot?: boolean;
	accessMode?: 'read only' | 'read write';
	isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
}

export abstract class MySqlSession<
	TQueryResult extends QueryResultHKT = QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> {
	constructor(protected dialect: MySqlDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig, TPreparedQueryHKT extends PreparedQueryHKT>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
	): PreparedQueryKind<TPreparedQueryHKT, T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			undefined,
		).execute();
	}

	abstract all<T = unknown>(query: SQL): Promise<T[]>;

	abstract transaction<T>(
		transaction: (tx: MySqlTransaction<TQueryResult, TPreparedQueryHKT>) => Promise<T>,
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

export abstract class MySqlTransaction<
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
> extends MySqlDatabase<TQueryResult, TPreparedQueryHKT> {
	constructor(dialect: MySqlDialect, session: MySqlSession, protected readonly nestedIndex = 0) {
		super(dialect, session);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<T>(
		transaction: (tx: MySqlTransaction<TQueryResult, TPreparedQueryHKT>) => Promise<T>,
	): Promise<T>;
}

export interface PreparedQueryHKTBase extends PreparedQueryHKT {
	type: PreparedQuery<Assume<this['config'], PreparedQueryConfig>>;
}
