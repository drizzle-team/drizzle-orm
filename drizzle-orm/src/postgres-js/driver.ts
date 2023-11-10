import type { Sql } from 'postgres';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { PostgresJsQueryResultHKT } from './session.ts';
import { PostgresJsSession } from './session.ts';

export type PostgresJsDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = PgDatabase<PostgresJsQueryResultHKT, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Sql,
	config: DrizzleConfig<TSchema> = {},
): PostgresJsDatabase<TSchema> {
	const dialect = new PgDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(
			config.schema,
			createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const session = new PostgresJsSession(client, dialect, schema, { logger });
	return new PgDatabase(dialect, session, schema) as PostgresJsDatabase<TSchema>;
}
