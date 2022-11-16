import { Query, SQL } from 'drizzle-orm/sql';

export interface PreparedQuery<TStatement = unknown> {
	stmt: TStatement;
	queryString: string;
	params: unknown[];

	finalize?(): void;
}

export interface SQLiteSession<TStatement> {
	prepareQuery(query: Query): PreparedQuery<TStatement>;
}

export interface SQLiteSyncSession<TStatement, TRunResult> extends SQLiteSession<TStatement> {
	run(query: SQL | PreparedQuery<TStatement>): TRunResult;
	all<T extends any[] = unknown[]>(query: SQL | PreparedQuery<TStatement>): T[];
	allObjects<T = unknown>(query: SQL | PreparedQuery<TStatement>): T[];
}

export interface SQLiteAsyncSession<TStatement, TRunResult> extends SQLiteSession<TStatement> {
	run(query: SQL | PreparedQuery<TStatement>): Promise<TRunResult>;
	all<T extends any[] = unknown[]>(query: SQL | PreparedQuery<TStatement>): Promise<T[]>;
	allObjects<T = unknown>(query: SQL | PreparedQuery<TStatement>): Promise<T[]>;
}
