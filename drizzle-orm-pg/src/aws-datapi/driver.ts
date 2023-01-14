import { Logger } from 'drizzle-orm';
import { PgDatabase } from '~/db';
import { PgDialect } from '~/dialect';
import { AwsDataApiClient, AwsDataApiSession } from './session';

export interface PgDriverOptions {
	logger?: Logger;
	database: string,
	resourceArn: string,
	secretArn: string,
}

export class AwsDataApiDriver {
	constructor(
		private client: AwsDataApiClient,
		private dialect: PgDialect,
		private options: PgDriverOptions,
	) {
		this.initMappers();
	}

	createSession(): AwsDataApiSession {
		return new AwsDataApiSession(this.client, this.dialect, this.options);
	}

	initMappers() {
		// types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		// types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		// types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export interface DrizzleConfig {
	logger?: Logger;
	database: string,
	resourceArn: string,
	secretArn: string,
}

export { PgDatabase } from '~/db';

export function drizzle(client: AwsDataApiClient, config: DrizzleConfig): PgDatabase {
	const dialect = new PgDialect();
	const driver = new AwsDataApiDriver(client, dialect, config);
	const session = driver.createSession();
	return dialect.createDB(session);
}
