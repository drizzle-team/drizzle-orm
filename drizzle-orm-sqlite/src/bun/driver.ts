import { Database } from 'bun:sqlite';
import { Logger } from 'drizzle-orm';
import { SQLiteSyncDialect } from '~/dialect';
import { SQLiteBunSession } from './session';

export interface SQLiteDriverOptions {
	logger?: Logger;
}

export class SQLiteBunDriver {
	private session!: SQLiteBunSession;

	constructor(
		private client: Database,
		private dialect: SQLiteSyncDialect,
		private options: SQLiteDriverOptions = {},
	) {}

	connect(): SQLiteBunSession {
		this.session = new SQLiteBunSession(this.client, this.dialect, { logger: this.options.logger });
		return this.session;
	}
}
