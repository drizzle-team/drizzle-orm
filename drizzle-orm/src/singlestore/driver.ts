import { type Connection as CallbackConnection, createPool, type Pool as CallbackPool, type PoolOptions } from 'mysql2';
import type { Connection, Pool } from 'mysql2/promise';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { SingleStoreDatabase } from '~/singlestore-core/db.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import { type DrizzleConfig, type IfNotImported, type ImportTypeError, isConfig } from '~/utils.ts';
import type {
	SingleStoreDriverClient,
	SingleStoreDriverPreparedQueryHKT,
	SingleStoreDriverQueryResultHKT,
} from './session.ts';
import { SingleStoreDriverSession } from './session.ts';

export interface SingleStoreDriverOptions {
	logger?: Logger;
}

export class SingleStoreDriverDriver {
	static readonly [entityKind]: string = 'SingleStoreDriverDriver';

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

export class SingleStoreDriverDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends SingleStoreDatabase<SingleStoreDriverQueryResultHKT, SingleStoreDriverPreparedQueryHKT, TSchema> {
	static override readonly [entityKind]: string = 'SingleStoreDriverDatabase';
}

export type SingleStoreDriverDrizzleConfig<TSchema extends Record<string, unknown> = Record<string, never>> =
	& Omit<DrizzleConfig<TSchema>, 'schema'>
	& ({ schema: TSchema } | { schema?: undefined });

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends Pool | Connection | CallbackPool | CallbackConnection = CallbackPool,
>(
	client: TClient,
	config: SingleStoreDriverDrizzleConfig<TSchema> = {},
): SingleStoreDriverDatabase<TSchema> & {
	$client: TClient;
} {
	const dialect = new SingleStoreDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const clientForInstance = isCallbackClient(client) ? client.promise() : client;

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

	const driver = new SingleStoreDriverDriver(clientForInstance as SingleStoreDriverClient, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new SingleStoreDriverDatabase(dialect, session, schema as any) as SingleStoreDriverDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

interface CallbackClient {
	promise(): SingleStoreDriverClient;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}

export type AnySingleStoreDriverConnection = Pool | Connection | CallbackPool | CallbackConnection;

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends AnySingleStoreDriverConnection = CallbackPool,
>(
	...params: IfNotImported<
		CallbackPool,
		[ImportTypeError<'singlestore'>],
		[
			TClient | string,
		] | [
			TClient | string,
			SingleStoreDriverDrizzleConfig<TSchema>,
		] | [
			(
				& SingleStoreDriverDrizzleConfig<TSchema>
				& ({
					connection: string | PoolOptions;
				} | {
					client: TClient;
				})
			),
		]
	>
): SingleStoreDriverDatabase<TSchema> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const connectionString = params[0]!;
		const instance = createPool({
			uri: connectionString,
		});

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& { connection?: PoolOptions | string; client?: TClient }
			& SingleStoreDriverDrizzleConfig<TSchema>;

		if (client) return construct(client, drizzleConfig) as any;

		const instance = typeof connection === 'string'
			? createPool({
				uri: connection,
			})
			: createPool(connection!);
		const db = construct(instance, drizzleConfig);

		return db as any;
	}

	return construct(params[0] as TClient, params[1] as SingleStoreDriverDrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: SingleStoreDriverDrizzleConfig<TSchema>,
	): SingleStoreDriverDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
