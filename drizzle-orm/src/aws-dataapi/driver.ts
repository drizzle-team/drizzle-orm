import { Logger } from '~/logger';
import { PgDatabase } from '~/pg-core/db';
import { PgDialect } from '~/pg-core/dialect';
import { AwsDataApiClient, AwsDataApiPgQueryResultHKT, AwsDataApiSession } from './session';

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

export type AwsDataApiPgDatabase = PgDatabase<AwsDataApiPgQueryResultHKT, AwsDataApiSession>;

export function drizzle(client: AwsDataApiClient, config: DrizzleConfig): AwsDataApiPgDatabase {
	const dialect = new PgDialect();
	const driver = new AwsDataApiDriver(client, dialect, config);
	const session = driver.createSession();
	return new PgDatabase(dialect, session);
}