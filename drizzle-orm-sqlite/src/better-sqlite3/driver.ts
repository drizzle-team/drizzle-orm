import { Database } from 'better-sqlite3';
import { Logger } from 'drizzle-orm';
import { SQLiteSyncDialect } from '~/dialect';
import { BetterSQLiteSession } from './session';

export interface SQLiteDriverOptions {
	logger?: Logger;
}

export class SQLiteDriver {
	private session!: BetterSQLiteSession;

	constructor(
		private client: Database,
		private dialect: SQLiteSyncDialect,
		private options: SQLiteDriverOptions = {},
	) {}

	connect(): BetterSQLiteSession {
		this.session = new BetterSQLiteSession(this.client, this.dialect, { logger: this.options.logger });
		return this.session;
	}
}
