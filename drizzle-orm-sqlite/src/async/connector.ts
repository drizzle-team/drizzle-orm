import { Logger, MigrationConfig, readMigrationFiles } from 'drizzle-orm';
import { Database, RunResult, Statement } from 'sqlite3';
import { SQLiteAsyncDatabase } from '~/db';
import { SQLiteAsyncDialect, SQLiteDialect } from '~/dialect';
import { SQLiteDriver } from './driver';
import { SQLite3Session } from './session';

export interface SQLiteConnectorOptions {
	logger?: Logger;
	dialect?: SQLiteDialect;
	driver?: SQLiteDriver;
}

export type SQLite3Database = SQLiteAsyncDatabase<Statement, RunResult>;

export class SQLite3Connector {
	dialect: SQLiteAsyncDialect;
	driver: SQLiteDriver;
	private session: SQLite3Session | undefined;

	constructor(client: Database, options: SQLiteConnectorOptions = {}) {
		this.dialect = new SQLiteAsyncDialect();
		this.driver = new SQLiteDriver(client, this.dialect, { logger: options.logger });
	}

	private getSession() {
		return this.session ?? (this.session = this.driver.connect());
	}

	connect(): SQLite3Database {
		const session = this.getSession();
		return new SQLiteAsyncDatabase(this.dialect, session);
	}

	migrate(config: string | MigrationConfig) {
		const migrations = readMigrationFiles(config);
		const session = this.getSession();
		this.dialect.migrate(migrations, session);
	}
}
