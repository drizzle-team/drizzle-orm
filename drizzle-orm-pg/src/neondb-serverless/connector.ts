import { Logger, MigrationConfig, readMigrationFiles } from 'drizzle-orm';
import { PgDialect } from '~/dialect';
import { PgSession } from '~/session';
import { NeonDriver } from './driver';
import { NeonClient, NeonSession } from './session';

export interface PgConnectorOptions {
	logger?: Logger;
	dialect?: PgDialect;
	driver?: NeonDriver;
}

export class NeonConnector {
	dialect: PgDialect;
	driver: NeonDriver;
	private session: NeonSession | undefined;

	constructor(client: NeonClient, options: PgConnectorOptions = {}) {
		this.dialect = new PgDialect();
		this.driver = new NeonDriver(client, this.dialect, { logger: options.logger });
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
