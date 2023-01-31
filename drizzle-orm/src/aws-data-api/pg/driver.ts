import { Logger } from '~/logger';
import { PgDatabase } from '~/pg-core/db';
import { PgDialect } from '~/pg-core/dialect';
import { AwsDataApiClient, AwsDataApiPgQueryResultHKT, AwsDataApiSession } from './session';

export interface PgDriverOptions {
	logger?: Logger;
	database: string;
	resourceArn: string;
	secretArn: string;
}

export class AwsDataApiDriver {
	constructor(
		private client: AwsDataApiClient,
		private dialect: PgDialect,
		private options: PgDriverOptions,
	) {
	}

	createSession(): AwsDataApiSession {
		return new AwsDataApiSession(this.client, this.dialect, this.options);
	}
}

export interface DrizzleConfig {
	logger?: Logger;
	database: string;
	resourceArn: string;
	secretArn: string;
}

export type AwsDataApiPgDatabase = PgDatabase<AwsDataApiPgQueryResultHKT, AwsDataApiSession>;

export class AwsPgDialect extends PgDialect {
	override escapeName(name: string): string {
		return `"${name}"`;
	}

	override escapeParam(num: number): string {
		return `:${num + 1}`;
	}
}

export function drizzle(client: AwsDataApiClient, config: DrizzleConfig): AwsDataApiPgDatabase {
	const dialect = new AwsPgDialect();
	const driver = new AwsDataApiDriver(client, dialect, config);
	const session = driver.createSession();
	return new PgDatabase(dialect, session);
}
