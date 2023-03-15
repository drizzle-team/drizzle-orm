import type { Database, RunResult } from 'better-sqlite3';
import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import { BetterSQLiteSession } from './session';

export interface DrizzleConfig {
	logger?: boolean | Logger;
}

export type BetterSQLite3Database = BaseSQLiteDatabase<'sync', RunResult>;

export function drizzle(client: Database, config: DrizzleConfig = {}): BetterSQLite3Database {
	const dialect = new SQLiteSyncDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const session = new BetterSQLiteSession(client, dialect, { logger });
	return new BaseSQLiteDatabase(dialect, session);
}
