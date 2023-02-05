import { Logger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import { SQLiteRemoteSession } from './session';

export interface DrizzleConfig {
	logger?: Logger;
}

export interface SqliteRemoteResult<T = unknown> {
	rows?: T[];
}

export type SqliteRemoteDatabase = BaseSQLiteDatabase<'async', SqliteRemoteResult>;

export type AsyncRemoteCallback = (
	sql: string,
	params: any[],
	method: 'run' | 'all' | 'values' | 'get',
) => Promise<{ rows: any[] }>;

export type RemoteCallback = AsyncRemoteCallback;

export function drizzle(callback: RemoteCallback, config: DrizzleConfig = {}): SqliteRemoteDatabase {
	const dialect = new SQLiteAsyncDialect();
	const session = new SQLiteRemoteSession(callback, dialect, { logger: config.logger });
	return new BaseSQLiteDatabase(dialect, session);
}
