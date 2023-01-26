import { Sql } from 'postgres';
import { Logger } from '~/logger';
import { PgDatabase } from '~/pg-core/db';
import { PgDialect } from '~/pg-core/dialect';
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
