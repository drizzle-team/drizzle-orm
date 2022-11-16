import { Logger, MigrationConfig, readMigrationFiles } from 'drizzle-orm';
import { SQLiteAsyncDatabase } from '~/db';
import { SQLiteAsyncDialect, SQLiteDialect } from '~/dialect';
import { SQLiteD1Driver } from './driver';
import { SQLiteD1Session } from './session';

export interface SQLiteConnectorOptions {
	logger?: Logger;
	dialect?: SQLiteDialect;
	driver?: SQLiteD1Driver;
}

export type SQLiteD1Database = SQLiteAsyncDatabase<D1PreparedStatement, D1Result>;

export class SQLiteD1Connector {
	dialect: SQLiteAsyncDialect;
	driver: SQLiteD1Driver;
	private session: SQLiteD1Session | undefined;

	constructor(client: D1Database, options: SQLiteConnectorOptions = {}) {
		this.dialect = new SQLiteAsyncDialect();
		this.driver = new SQLiteD1Driver(client, this.dialect, { logger: options.logger });
	}

	private getSession() {
		return this.session ?? (this.session = this.driver.connect());
	}

	connect(): SQLiteD1Database {
		const session = this.getSession();
		return new SQLiteAsyncDatabase(this.dialect, session);
	}

	migrate(config: string | MigrationConfig) {
		const migrations = readMigrationFiles(config);
		const session = this.getSession();
		this.dialect.migrate(migrations, session);
	}
}
