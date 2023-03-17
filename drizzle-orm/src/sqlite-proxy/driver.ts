import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import { SQLiteRemoteSession } from './session';

export interface DrizzleConfig {
	logger?: boolean | Logger;
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
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const session = new SQLiteRemoteSession(callback, dialect, { logger });
	return new BaseSQLiteDatabase(dialect, session);
}
