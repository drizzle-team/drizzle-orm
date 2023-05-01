import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { type VercelPgClient, VercelPgSession, type VercelPgQueryResultHKT } from './session';
import { PgDialect } from '~/pg-core';
import { PgDatabase } from '~/pg-core/db';

export interface VercelPgDriverOptions {
	logger?: Logger;
}

export class VercelPgDriver {
	constructor(
		private client: VercelPgClient,
		private dialect: PgDialect,
		private options: VercelPgDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(): VercelPgSession {
		return new VercelPgSession(this.client, this.dialect, { logger: this.options.logger });
	}

	initMappers() {
		// types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		// types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		// types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export interface DrizzleConfig {
	logger?: boolean | Logger;
}

export type VercelPgDatabase = PgDatabase<VercelPgQueryResultHKT>;

export function drizzle(client: VercelPgClient, config: DrizzleConfig = {}): VercelPgDatabase {
	const dialect = new PgDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const driver = new VercelPgDriver(client, dialect, { logger });
	const session = driver.createSession();
	return new PgDatabase(dialect, session);
}
