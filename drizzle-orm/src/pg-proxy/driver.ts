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
import { type PgRemoteQueryResultHKT, PgRemoteSession } from './session.ts';

export type PgRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = PgDatabase<PgRemoteQueryResultHKT, TSchema>;

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
	typings?: any[],
) => Promise<{ rows: any[] }>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	config: DrizzleConfig<TSchema> = {},
	_dialect: () => PgDialect = () => new PgDialect(),
): PgRemoteDatabase<TSchema> {
	const dialect = _dialect();
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
			tables: config.schema,
			tablesConfig: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const session = new PgRemoteSession(callback, dialect, schema, { logger });
	return new PgDatabase(dialect, session, schema) as PgRemoteDatabase<TSchema>;
}
