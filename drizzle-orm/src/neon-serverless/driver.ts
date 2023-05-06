import { types } from '@neondatabase/serverless';
import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { PgDatabase } from '~/pg-core/db';
import { PgDialect } from '~/pg-core/dialect';
import { type DrizzleConfig } from '~/utils';
import type { NeonClient, NeonQueryResultHKT } from './session';
import { NeonSession } from './session';

export interface NeonDriverOptions {
	logger?: Logger;
}

export class NeonDriver {
	constructor(
		private client: NeonClient,
		private dialect: PgDialect,
		private options: NeonDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(): NeonSession {
		return new NeonSession(this.client, this.dialect, { logger: this.options.logger });
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export type NeonDatabase = PgDatabase<NeonQueryResultHKT>;

export function drizzle(client: NeonClient, config: DrizzleConfig = {}): NeonDatabase {
	const dialect = new PgDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const driver = new NeonDriver(client, dialect, { logger });
	const session = driver.createSession();
	return new PgDatabase(dialect, session, config.schema);
}
