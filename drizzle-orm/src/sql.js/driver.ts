import { Logger } from 'drizzle-orm';
import { Database } from 'sql.js';
import { BaseSQLiteDatabase } from '~/db';
import { SQLiteSyncDialect } from '~/dialect';
import { SQLJsSession } from './session';

export interface DrizzleConfig {
	logger?: Logger;
}

export type SQLJsDatabase = BaseSQLiteDatabase<'sync', void>;

export function drizzle(client: Database, config: DrizzleConfig = {}): SQLJsDatabase {
	const dialect = new SQLiteSyncDialect();
	const session = new SQLJsSession(client, dialect, { logger: config.logger });
	return new BaseSQLiteDatabase(dialect, session);
}
