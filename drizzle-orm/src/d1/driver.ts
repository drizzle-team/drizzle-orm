/// <reference types="@cloudflare/workers-types" />

import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { BaseSQLiteDatabase } from '~/sqlite-core/db';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import { SQLiteD1Session } from './session';

export interface DrizzleConfig {
	logger?: boolean | Logger;
}

export type DrizzleD1Database = BaseSQLiteDatabase<'async', D1Result>;

export function drizzle(client: D1Database, config: DrizzleConfig = {}): DrizzleD1Database {
	const dialect = new SQLiteAsyncDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const session = new SQLiteD1Session(client, dialect, { logger });
	return new BaseSQLiteDatabase(dialect, session);
}
