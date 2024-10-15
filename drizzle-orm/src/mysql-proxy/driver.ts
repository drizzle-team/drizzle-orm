import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type MySqlRemotePreparedQueryHKT, type MySqlRemoteQueryResultHKT, MySqlRemoteSession } from './session.ts';

export class MySqlRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends MySqlDatabase<MySqlRemoteQueryResultHKT, MySqlRemotePreparedQueryHKT, TSchema> {
	static override readonly [entityKind]: string = 'MySqlRemoteDatabase';
}

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
) => Promise<{ rows: any[]; insertId?: number; affectedRows?: number }>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	config: DrizzleConfig<TSchema> = {},
): MySqlRemoteDatabase<TSchema> {
	const dialect = new MySqlDialect({ casing: config.casing });
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

	const session = new MySqlRemoteSession(callback, dialect, schema, { logger });
	return new MySqlRemoteDatabase(dialect, session, schema as any, 'default') as MySqlRemoteDatabase<TSchema>;
}
