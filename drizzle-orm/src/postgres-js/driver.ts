import type { Sql } from 'postgres';
import { entityKind } from '~/entity.ts';
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

export class PostgresJsDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<PostgresJsQueryResultHKT, TSchema> {
	static readonly [entityKind]: string = 'PostgresJsDatabase';
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Sql,
	config: DrizzleConfig<TSchema> = {},
): PostgresJsDatabase<TSchema> {
	const transparentParser = (val: any) => val;

	// Override postgres.js default date parsers: https://github.com/porsager/postgres/discussions/761
	for (const type of ['1184', '1082', '1083', '1114']) {
		client.options.parsers[type as any] = transparentParser;
		client.options.serializers[type as any] = transparentParser;
	}
	client.options.serializers['114'] = transparentParser;
	client.options.serializers['3802'] = transparentParser;

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
	return new PostgresJsDatabase(dialect, session, schema as any) as PostgresJsDatabase<TSchema>;
}
