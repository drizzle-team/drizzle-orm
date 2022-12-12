import { Logger } from 'drizzle-orm';
import { MySqlDialect } from '~/dialect';
import { MySql2Client, MySql2Session } from './session';

export interface PgDriverOptions {
	logger?: Logger;
}

export class MySql2Driver {
	constructor(
		private client: MySql2Client,
		private dialect: MySqlDialect,
		private options: PgDriverOptions = {},
	) {
		// this.initMappers();
	}

	async connect(): Promise<MySql2Session> {
		return new MySql2Session(this.client, this.dialect, { logger: this.options.logger });
	}

	// initMappers() {
	// 	types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
	// 	types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
	// 	types.setTypeParser(types.builtins.DATE, (val) => val);
	// }
}

export function pg(client: MySql2Client, options: PgDriverOptions = {}) {
	return new MySql2Driver(client, new MySqlDialect(), options);
}
