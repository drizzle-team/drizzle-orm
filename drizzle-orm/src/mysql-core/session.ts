import type { Query, SQL } from '~/sql';
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

	// /** @internal */
	// abstract values(placeholderValues?: Record<string, unknown>): Promise<T['values']>;
}

export abstract class MySqlSession {
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

	// values<T extends unknown[] = unknown[]>(query: SQL): Promise<T[]> {
	// 	return this.prepareQuery<PreparedQueryConfig & { values: T[] }>(
	// 		this.dialect.sqlToQuery(query),
	// 		undefined,
	// 		undefined,
	// 	).values();
	// }
}
