import { Database, RunResult } from 'better-sqlite3';
import { Logger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import { BetterSQLiteSession } from './session';

export interface DrizzleConfig {
	logger?: Logger;
}

export type BetterSQLite3Database = BaseSQLiteDatabase<'sync', RunResult>;

export function drizzle(client: Database, config: DrizzleConfig = {}): BetterSQLite3Database {
	const dialect = new SQLiteSyncDialect();
	const session = new BetterSQLiteSession(client, dialect, { logger: config.logger });
	return new BaseSQLiteDatabase(dialect, session);
}
