/// <reference types="bun-types" />

import { Database } from 'bun:sqlite';
import { DefaultLogger, Logger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import { SQLiteBunSession } from './session';

export interface DrizzleConfig {
	logger?: boolean | Logger;
}

export type BunSQLiteDatabase = BaseSQLiteDatabase<'sync', void>;

export function drizzle(client: Database, config: DrizzleConfig = {}): BunSQLiteDatabase {
	const dialect = new SQLiteSyncDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const session = new SQLiteBunSession(client, dialect, { logger });
	return new BaseSQLiteDatabase(dialect, session);
}
