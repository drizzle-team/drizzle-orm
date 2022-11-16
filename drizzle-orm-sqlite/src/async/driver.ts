import { Logger } from 'drizzle-orm';
import { Database } from 'sqlite3';
import { SQLiteDialect } from '~/dialect';
import { SQLite3Session } from './session';

export interface SQLiteDriverOptions {
	logger?: Logger;
}

export class SQLiteDriver {
	private session!: SQLite3Session;

	constructor(
		private client: Database,
		private dialect: SQLiteDialect,
		private options: SQLiteDriverOptions = {},
	) {}

	connect() {
		return this.session = new SQLite3Session(this.client, this.dialect, { logger: this.options.logger });
	}
}
