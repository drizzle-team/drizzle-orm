import type { Connection } from '@tidbcloud/serverless';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
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
import type { TiDBServerlessPreparedQueryHKT, TiDBServerlessQueryResultHKT } from './session.ts';
import { TiDBServerlessSession } from './session.ts';

export interface TiDBServerlessSDriverOptions {
	logger?: Logger;
}

export class TiDBServerlessDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends MySqlDatabase<TiDBServerlessQueryResultHKT, TiDBServerlessPreparedQueryHKT, TSchema> {
	static override readonly [entityKind]: string = 'TiDBServerlessDatabase';
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Connection,
	config: DrizzleConfig<TSchema> = {},
): TiDBServerlessDatabase<TSchema> & {
	$client: Connection;
} {
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

	const session = new TiDBServerlessSession(client, dialect, undefined, schema, { logger });
	const db = new TiDBServerlessDatabase(dialect, session, schema as any, 'default') as TiDBServerlessDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}
