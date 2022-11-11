import { Database } from 'better-sqlite3';
import { Logger } from 'drizzle-orm';
import { SQLiteDialect } from '~/dialect';
import { SQLiteSession } from '~/session';
import { SQLiteDefaultSession } from './session';

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
		this.session = new SQLiteDefaultSession(this.client, this.dialect, { logger: this.options.logger });
		return this.session;
	}
}
