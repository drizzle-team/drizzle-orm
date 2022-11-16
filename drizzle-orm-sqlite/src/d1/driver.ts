import { Logger } from 'drizzle-orm';
import { SQLiteDialect } from '~/dialect';
import { SQLiteD1Session } from './session';

export interface SQLiteD1DriverOptions {
	logger?: Logger;
}

export class SQLiteD1Driver {
	private session!: SQLiteD1Session;

	constructor(
		private client: D1Database,
		private dialect: SQLiteDialect,
		private options: SQLiteD1DriverOptions = {},
	) {}

	connect() {
		return this.session = new SQLiteD1Session(this.client, this.dialect, { logger: this.options.logger });
	}
}
