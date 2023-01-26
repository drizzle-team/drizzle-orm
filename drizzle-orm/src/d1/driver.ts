/// <reference types="@cloudflare/workers-types" />

import { Logger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import { SQLiteD1Session } from './session';

export interface DrizzleConfig {
	logger?: Logger;
}

export type DrizzleD1Database = BaseSQLiteDatabase<'async', D1Result>;

export function drizzle(client: D1Database, config: DrizzleConfig = {}): DrizzleD1Database {
	const dialect = new SQLiteAsyncDialect();
	const session = new SQLiteD1Session(client, dialect, { logger: config.logger });
	return new BaseSQLiteDatabase(dialect, session);
}
