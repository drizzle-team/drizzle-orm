import type { Statement as BetterSqliteStatement } from 'better-sqlite3';
import type { Statement as BunStatement } from 'bun:sqlite';
import { SQL } from 'drizzle-orm/sql';

export interface RunResult {
	changes: number;
	lastInsertRowid: number | bigint;
}

export class SQLiteStatement<T> {
	constructor(private statement: BunStatement | BetterSqliteStatement) {}

	execute(): T {
		return this.statement.all() as T;
	}
}

export interface SQLiteSession {
	run(query: SQL): RunResult;
	all<T extends any[] = unknown[]>(query: SQL): T[];
	allObjects<T = unknown>(query: SQL): T[];
	prepare<T>(query: SQL): SQLiteStatement<T>;
}
