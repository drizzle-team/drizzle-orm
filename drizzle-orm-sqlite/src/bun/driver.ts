import { Database } from 'bun:sqlite';
import { Logger } from 'drizzle-orm';
import { SQLiteDialect } from '~/dialect';
import { SQLiteSession } from '~/session';
import { SQLiteBunSession } from './session';

export interface SQLiteDriverOptions {
	logger?: Logger;
}

export class SQLiteDriver {
	private session!: SQLiteSession;

	constructor(
		private client: Database,
		private dialect: SQLiteDialect,
		private options: SQLiteDriverOptions = {},
	) {}

	connect(): SQLiteSession {
		this.session = new SQLiteBunSession(this.client, this.dialect, { logger: this.options.logger });
		return this.session;
	}
}
