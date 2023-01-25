/// <reference types="bun-types" />

import { Database } from 'bun:sqlite';
import { Logger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import { SQLiteBunSession } from './session';

export interface DrizzleConfig {
	logger?: Logger;
}

export type BunSQLiteDatabase = BaseSQLiteDatabase<'sync', void>;

export function drizzle(client: Database, config: DrizzleConfig = {}): BunSQLiteDatabase {
	const dialect = new SQLiteSyncDialect();
	const session = new SQLiteBunSession(client, dialect, { logger: config.logger });
	return new BaseSQLiteDatabase(dialect, session);
}
