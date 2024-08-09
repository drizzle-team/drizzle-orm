import type { Sql } from 'postgres';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { EmptyRelations, RelationalSchemaConfig, Relations, TablesRelationalConfig } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { PostgresJsQueryResultHKT } from './session.ts';
import { PostgresJsSession } from './session.ts';

export type PostgresJsDatabase<
	TRelations extends Relations = EmptyRelations,
> = PgDatabase<PostgresJsQueryResultHKT, TRelations>;

export function drizzle<TRelations extends Relations = EmptyRelations>(
	client: Sql,
	config: DrizzleConfig<TRelations> = {},
): PostgresJsDatabase<TRelations> {
	const transparentParser = (val: any) => val;

	// Override postgres.js default date parsers: https://github.com/porsager/postgres/discussions/761
	for (const type of ['1184', '1082', '1083', '1114']) {
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
	if (config.relations) {
		schema = {
			tables: config.relations.tables,
			tablesConfig: config.relations.tablesConfig,
			tableNamesMap: config.relations.tableNamesMap,
		};
	}

	const session = new PostgresJsSession(client, dialect, schema, { logger });
	return new PgDatabase(dialect, session, schema) as PostgresJsDatabase<TRelations>;
}
