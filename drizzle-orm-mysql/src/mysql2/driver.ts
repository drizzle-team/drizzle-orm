import { Logger } from 'drizzle-orm';
import { MySqlDialect } from '~/dialect';
import { MySqlDatabase } from '.';
import { MySql2Client, MySql2Session } from './session';

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
	logger?: Logger;
}

export { MySqlDatabase } from '~/db';

export function drizzle(client: MySql2Client, config: DrizzleConfig = {}): MySqlDatabase {
	const dialect = new MySqlDialect();
	const driver = new MySql2Driver(client, dialect, { logger: config.logger });
	const session = driver.createSession();
	return dialect.createDB(session);
}
