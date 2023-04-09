import type { Sql } from 'postgres';
import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { PgDatabase } from '~/pg-core/db';
import { PgDialect } from '~/pg-core/dialect';
import type { PostgresJsQueryResultHKT } from './session';
import { PostgresJsSession } from './session';

export interface DrizzleConfig {
	logger?: boolean | Logger;
}

export type PostgresJsDatabase = PgDatabase<PostgresJsQueryResultHKT>;

export function drizzle(client: Sql, config: DrizzleConfig = {}): PostgresJsDatabase {
	const dialect = new PgDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const session = new PostgresJsSession(client, dialect, { logger });
	return new PgDatabase(dialect, session);
}
