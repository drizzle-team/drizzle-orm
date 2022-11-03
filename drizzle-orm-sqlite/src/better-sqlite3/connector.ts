import { Database } from 'better-sqlite3';
import { Logger, MigrationConfig, readMigrationFiles } from 'drizzle-orm';
import { SQLiteDialect } from '~/dialect';
import { SQLiteSession } from '~/session';
import { SQLiteDriver } from './driver';

export interface SQLiteConnectorOptions {
	logger?: Logger;
	dialect?: SQLiteDialect;
	driver?: SQLiteDriver;
}

export class SQLiteConnector {
	dialect: SQLiteDialect;
	driver: SQLiteDriver;
	private session: SQLiteSession | undefined;

	constructor(client: Database, options: SQLiteConnectorOptions = {}) {
		this.dialect = new SQLiteDialect();
		this.driver = new SQLiteDriver(client, this.dialect, { logger: options.logger });
	}

	private getSession() {
		return this.session ?? (this.session = this.driver.connect());
	}

	connect() {
		const session = this.getSession();
		return this.dialect.createDB(session);
	}

	migrate(config: string | MigrationConfig) {
		const migrations = readMigrationFiles(config);
		const session = this.getSession();
		this.dialect.migrate(migrations, session);
	}
}
