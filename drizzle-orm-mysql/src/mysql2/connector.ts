import { Logger, MigrationConfig, readMigrationFiles } from 'drizzle-orm';
import { MySqlDialect } from '~/dialect';
import { MySqlSession } from '~/session';
import { MySql2Driver } from './driver';
import { MySql2Client } from './session';

export interface PgConnectorOptions {
	logger?: Logger;
	dialect?: MySqlDialect;
	driver?: MySql2Driver;
}

export class MySqlConnector {
	dialect: MySqlDialect;
	driver: MySql2Driver;
	private session: MySqlSession | undefined;

	constructor(client: MySql2Client, options: PgConnectorOptions = {}) {
		this.dialect = new MySqlDialect();
		this.driver = new MySql2Driver(client, this.dialect, { logger: options.logger });
	}

	private async getSession() {
		return this.session ?? (this.session = await this.driver.connect());
	}

	async connect() {
		const session = await this.getSession();
		return this.dialect.createDB(session);
	}

	async migrate(config: string | MigrationConfig) {
		const migrations = readMigrationFiles(config);
		const session = await this.getSession();
		await this.dialect.migrate(migrations, session);
	}
}
