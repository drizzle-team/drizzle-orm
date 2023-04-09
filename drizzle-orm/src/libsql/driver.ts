import type { Client, ResultSet } from '@libsql/client';
import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import { LibSQLSession } from './session';

export interface DrizzleConfig {
	logger?: boolean | Logger;
}

export type LibSQLDatabase = BaseSQLiteDatabase<'async', ResultSet>;

export function drizzle(client: Client, config: DrizzleConfig = {}): LibSQLDatabase {
	const dialect = new SQLiteAsyncDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const session = new LibSQLSession(client, dialect, { logger }, undefined);
	return new BaseSQLiteDatabase(dialect, session);
}
