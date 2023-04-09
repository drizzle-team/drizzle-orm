import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { PgDatabase } from '~/pg-core/db';
import { PgDialect } from '~/pg-core/dialect';
import type { AwsDataApiClient, AwsDataApiPgQueryResultHKT } from './session';
import { AwsDataApiSession } from './session';

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
		return new AwsDataApiSession(this.client, this.dialect, this.options, undefined);
	}
}

export interface DrizzleConfig {
	logger?: boolean | Logger;
	database: string;
	resourceArn: string;
	secretArn: string;
}

export type AwsDataApiPgDatabase = PgDatabase<AwsDataApiPgQueryResultHKT>;

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
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const driver = new AwsDataApiDriver(client, dialect, { ...config, logger });
	const session = driver.createSession();
	return new PgDatabase(dialect, session);
}
