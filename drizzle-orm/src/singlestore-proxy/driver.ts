import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { SingleStoreDatabase } from '~/singlestore-core/db.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import {
	type SingleStoreRemotePreparedQueryHKT,
	type SingleStoreRemoteQueryResultHKT,
	SingleStoreRemoteSession,
} from './session.ts';

export class SingleStoreRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends SingleStoreDatabase<SingleStoreRemoteQueryResultHKT, SingleStoreRemotePreparedQueryHKT, TSchema> {
	static override readonly [entityKind]: string = 'SingleStoreRemoteDatabase';
}

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
) => Promise<{ rows: any[]; insertId?: number; affectedRows?: number }>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	config: DrizzleConfig<TSchema> = {},
): SingleStoreRemoteDatabase<TSchema> {
	const dialect = new SingleStoreDialect({ casing: config.casing });
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

	const session = new SingleStoreRemoteSession(callback, dialect, schema, { logger });
	return new SingleStoreRemoteDatabase(dialect, session, schema as any) as SingleStoreRemoteDatabase<
		TSchema
	>;
}
