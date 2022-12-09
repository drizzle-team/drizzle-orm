import { Logger, MigrationConfig, readMigrationFiles } from 'drizzle-orm';
import { PgDatabase } from '~/db';
import { PgDialect } from '~/dialect';
import { NeonDriver } from './driver';
import { NeonClient, NeonSession } from './session';

export interface PgConnectorOptions {
	logger?: Logger;
	dialect?: PgDialect;
	driver?: NeonDriver;
}

export type NeonDatabase = PgDatabase;

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

	async connect(): Promise<NeonDatabase> {
		const session = await this.getSession();
		return this.dialect.createDB(session);
	}

	async migrate(config: string | MigrationConfig) {
		const migrations = readMigrationFiles(config);
		const session = await this.getSession();
		await this.dialect.migrate(migrations, session);
	}
}
