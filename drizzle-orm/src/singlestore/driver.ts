import { type Connection as CallbackConnection, createPool, type Pool as CallbackPool, type PoolOptions } from 'mysql2';
import type { Connection, Pool } from 'mysql2/promise';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SingleStoreDatabase } from '~/singlestore-core/db.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { npmVersion } from '~/version.ts';
import type {
	SingleStoreDriverClient,
	SingleStoreDriverPreparedQueryHKT,
	SingleStoreDriverQueryResultHKT,
} from './session.ts';
import { SingleStoreDriverSession } from './session.ts';

export interface SingleStoreDriverOptions {
	logger?: Logger;
	cache?: Cache;
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
		relations: AnyRelations,
	): SingleStoreDriverSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig> {
		return new SingleStoreDriverSession(this.client, this.dialect, relations, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}
}

export { SingleStoreDatabase } from '~/singlestore-core/db.ts';

export class SingleStoreDriverDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends SingleStoreDatabase<SingleStoreDriverQueryResultHKT, SingleStoreDriverPreparedQueryHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'SingleStoreDriverDatabase';
}

export type SingleStoreDriverDrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> =
	& Omit<DrizzleConfig<TSchema, TRelations>, 'schema'>
	& ({ schema: TSchema } | { schema?: undefined });

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Pool | Connection | CallbackPool | CallbackConnection = CallbackPool,
>(
	client: TClient,
	config: SingleStoreDriverDrizzleConfig<TSchema, TRelations> = {},
): SingleStoreDriverDatabase<TSchema, TRelations> & {
	$client: AnySingleStoreDriverConnection extends TClient ? CallbackPool : TClient;
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

	const relations = config.relations ?? {} as TRelations;
	const driver = new SingleStoreDriverDriver(clientForInstance as SingleStoreDriverClient, dialect, {
		logger,
		cache: config.cache,
	});
	const session = driver.createSession(schema, relations);
	const db = new SingleStoreDriverDatabase(dialect, session, relations, schema as any) as SingleStoreDriverDatabase<
		TSchema
	>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

interface CallbackClient {
	promise(): SingleStoreDriverClient;
}

function isCallbackClient(client: any): client is CallbackClient {
	return typeof client.promise === 'function';
}

export type AnySingleStoreDriverConnection = Pool | Connection | CallbackPool | CallbackConnection;

const CONNECTION_ATTRS: PoolOptions['connectAttributes'] = {
	_connector_name: 'SingleStore Drizzle ORM Driver',
	_connector_version: npmVersion,
};

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends AnySingleStoreDriverConnection = CallbackPool,
>(
	...params: [
		string,
	] | [
		string,
		SingleStoreDriverDrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& SingleStoreDriverDrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | PoolOptions;
			} | {
				client: TClient;
			})
		),
	]
): SingleStoreDriverDatabase<TSchema, TRelations> & {
	$client: AnySingleStoreDriverConnection extends TClient ? CallbackPool : TClient;
} {
	if (typeof params[0] === 'string') {
		const connectionString = params[0]!;
		const instance = createPool({
			uri: connectionString,
			connectAttributes: CONNECTION_ATTRS,
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& { connection?: PoolOptions | string; client?: TClient }
		& SingleStoreDriverDrizzleConfig<TSchema, TRelations>;

	if (client) return construct(client, drizzleConfig) as any;

	let opts: PoolOptions = {};
	opts = typeof connection === 'string'
		? {
			uri: connection,
			supportBigNumbers: true,
			connectAttributes: CONNECTION_ATTRS,
		}
		: {
			...connection,
			connectAttributes: {
				...connection!.connectAttributes,
				...CONNECTION_ATTRS,
			},
		};

	const instance = createPool(opts);
	const db = construct(instance, drizzleConfig);

	return db as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: SingleStoreDriverDrizzleConfig<TSchema, TRelations>,
	): SingleStoreDriverDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
