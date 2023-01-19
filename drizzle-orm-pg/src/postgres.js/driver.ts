import { Logger } from 'drizzle-orm';
import { Sql } from 'postgres';
import { PgDatabase } from '~/db';
import { PgDialect } from '~/dialect';
import { PostgresJsQueryResultHKT, PostgresJsSession } from './session';

export interface DrizzleConfig {
	logger?: Logger;
}

export type PostgresJsDatabase = PgDatabase<PostgresJsQueryResultHKT, PostgresJsSession>;

export function drizzle(client: Sql, config: DrizzleConfig = {}): PostgresJsDatabase {
	const dialect = new PgDialect();
	const session = new PostgresJsSession(client, dialect, { logger: config.logger });
	return new PgDatabase(dialect, session);
}
