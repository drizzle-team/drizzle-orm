import { DefaultLogger, Logger } from '~/logger';
import { MySqlDialect } from '~/mysql-core/dialect';
import { MySqlDatabase } from '.';
import { MySql2Client, MySql2QueryResultHKT, MySql2Session } from './session';

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

export type MySql2Database = MySqlDatabase<MySql2QueryResultHKT, MySql2Session>;

export function drizzle(
	client: MySql2Client,
	config: DrizzleConfig = {},
): MySql2Database {
	const dialect = new MySqlDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const driver = new MySql2Driver(client, dialect, { logger });
	const session = driver.createSession();
	return new MySqlDatabase(dialect, session);
}
