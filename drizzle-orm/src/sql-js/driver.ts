import { Database } from 'sql.js';
import { DefaultLogger, Logger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import { SQLJsSession } from './session';

export interface DrizzleConfig {
	logger?: boolean | Logger;
}

export type SQLJsDatabase = BaseSQLiteDatabase<'sync', void>;

export function drizzle(client: Database, config: DrizzleConfig = {}): SQLJsDatabase {
	const dialect = new SQLiteSyncDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const session = new SQLJsSession(client, dialect, { logger });
	return new BaseSQLiteDatabase(dialect, session);
}
