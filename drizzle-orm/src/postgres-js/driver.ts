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
	const transparentParser = (val: any) => val;

	// Override postgres.js default date parsers: https://github.com/porsager/postgres/discussions/761
	for (const type of ['1184', '1082', '1083', '1114', '114', '3802']) {
		client.options.parsers[type as any] = transparentParser;
		client.options.serializers[type as any] = transparentParser;
	}

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
