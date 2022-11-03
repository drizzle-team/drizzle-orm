import { SQL } from 'drizzle-orm/sql';

export interface RunResult {
	changes: number;
	lastInsertRowid: number | bigint;
}

export interface SQLiteSession {
	run(query: SQL): RunResult;
	all<T extends any[] = unknown[]>(query: SQL): T[];
	allObjects<T = unknown>(query: SQL): T[];
}
