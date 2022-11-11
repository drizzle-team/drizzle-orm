import type { Statement as BetterSQLiteStatement } from 'better-sqlite3';
import type { Statement as BunStatement } from 'bun:sqlite';
import { Query, SQL } from 'drizzle-orm/sql';

export interface RunResult {
	changes: number;
	lastInsertRowid: number | bigint;
}

export interface PreparedQuery {
	stmt: BunStatement<unknown> | BetterSQLiteStatement;
	queryString: string;
	params: unknown[];
}

export interface PreparedQueryExecuteConfig {
	stmt: PreparedQuery;
	placeholderValues: Record<string, unknown>;
}

export interface SQLiteSession {
	run(query: SQL | PreparedQuery): RunResult;
	all<T extends any[] = unknown[]>(query: SQL | PreparedQuery): T[];
	allObjects<T = unknown>(query: SQL | PreparedQuery): T[];
	prepareQuery(query: Query): PreparedQuery;
}
