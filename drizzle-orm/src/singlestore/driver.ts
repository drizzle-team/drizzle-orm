import type { Connection as CallbackConnection, Pool as CallbackPool } from 'mysql2';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
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
import type {
	SingleStoreDriverClient,
	SingleStoreDriverPreparedQueryHKT,
	SingleStoreDriverQueryResultHKT,
} from './session.ts';
import { SingleStoreDriverSession } from './session.ts';

export interface SingleStoreDriverOptions {
	logger?: Logger;
}

export class SingleStoreDriver {
	static readonly [entityKind]: string = 'SingleStoreDriver';

	constructor(
		private client: SingleStoreDriverClient,
		private dialect: SingleStoreDialect,
		private options: SingleStoreDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): SingleStoreDriverSession<Record<string, unknown>, TablesRelationalConfig> {
		return new SingleStoreDriverSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export { SingleStoreDatabase } from '~/singlestore-core/db.ts';

export type SingleStoreDriverDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = SingleStoreDatabase<SingleStoreDriverQueryResultHKT, SingleStoreDriverPreparedQueryHKT, TSchema>;


export type SingleStoreDriverDrizzleConfig<TSchema extends Record<string, unknown> = Record<string, never>> =
	& Omit<DrizzleConfig<TSchema>, 'schema'>
	& ({ schema: TSchema; mode: Mode } | { schema?: undefined; mode?: Mode });

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: SingleStoreDriverClient | CallbackConnection | CallbackPool,
	config: DrizzleConfig<TSchema> = {},
): SingleStoreDriverDatabase<TSchema> {
	const dialect = new SingleStoreDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	if (isCallbackClient(client)) {
		client = client.promise();
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

	const driver = new SingleStoreDriver(client as SingleStoreDriverClient, dialect, { logger });
	const session = driver.createSession(schema);
	return new SingleStoreDatabase(dialect, session, schema) as SingleStoreDriverDatabase<TSchema>;
}

interface CallbackClient {
	promise(): SingleStoreDriverClient;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}
