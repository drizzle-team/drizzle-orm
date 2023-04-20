import { type Connection as CallbackConnection, type Pool as CallbackPool } from 'mysql2';
import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { MySqlDialect } from '~/mysql-core/dialect';
import { MySqlDatabase } from '.';
import type { MySql2Client, MySql2PreparedQueryHKT, MySql2QueryResultHKT } from './session';
import { MySql2Session } from './session';

export interface MySqlDriverOptions {
	logger?: Logger;
}

export class MySql2Driver {
	constructor(
		private client: MySql2Client,
		private dialect: MySqlDialect,
		private options: MySqlDriverOptions = {},
	) {
	}

	createSession(): MySql2Session {
		return new MySql2Session(this.client, this.dialect, { logger: this.options.logger });
	}
}

export interface DrizzleConfig {
	logger?: boolean | Logger;
}

export { MySqlDatabase } from '~/mysql-core/db';

export type MySql2Database = MySqlDatabase<MySql2QueryResultHKT, MySql2PreparedQueryHKT>;

export function drizzle(
	client: MySql2Client | CallbackConnection | CallbackPool,
	config: DrizzleConfig = {},
): MySql2Database {
	const dialect = new MySqlDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	if (isCallbackClient(client)) {
		client = client.promise();
	}
	const driver = new MySql2Driver(client as MySql2Client, dialect, { logger });
	const session = driver.createSession();
	return new MySqlDatabase(dialect, session);
}

interface CallbackClient {
	promise(): MySql2Client;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}
