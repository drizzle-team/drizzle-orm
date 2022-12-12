import { Query, SQL } from 'drizzle-orm/sql';
import { FieldPacket } from 'mysql2/promise';
import { MySqlDialect } from './dialect';
import { SelectFieldsOrdered } from './operations';

// TODO: improve type
export type MySqlQueryResult = [any, FieldPacket[]];

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class PreparedQuery<T extends PreparedQueryConfig> {
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
		fields: SelectFieldsOrdered | undefined,
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
