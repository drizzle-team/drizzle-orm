import { types } from '@neondatabase/serverless';
import { Logger } from '~/logger';
import { PgDatabase } from '~/pg-core/db';
import { PgDialect } from '~/pg-core/dialect';
import { NeonClient, NeonQueryResultHKT, NeonSession } from './session';

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

export interface DrizzleConfig {
	logger?: Logger;
}

export type NeonDatabase = PgDatabase<NeonQueryResultHKT, NeonSession>;

export function drizzle(client: NeonClient, config: DrizzleConfig = {}): NeonDatabase {
	const dialect = new PgDialect();
	const driver = new NeonDriver(client, dialect, { logger: config.logger });
	const session = driver.createSession();
	return new PgDatabase(dialect, session);
}
