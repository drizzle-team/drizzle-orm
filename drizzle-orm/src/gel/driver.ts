import { type Client, type ConnectOptions, createClient } from 'gel';
import type { Cache } from '~/cache/core/index.ts';
import { entityKind } from '~/entity.ts';
import { GelDatabase } from '~/gel-core/db.ts';
import { GelDialect } from '~/gel-core/dialect.ts';
import type { GelQueryResultHKT } from '~/gel-core/session.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type { GelClient } from './session.ts';
import { GelDbSession } from './session.ts';

export interface GelDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class GelDriver {
	static readonly [entityKind]: string = 'GelDriver';

	constructor(
		private client: GelClient,
		private dialect: GelDialect,
		private options: GelDriverOptions = {},
	) {}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): GelDbSession<Record<string, unknown>, TablesRelationalConfig> {
		return new GelDbSession(this.client, this.dialect, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}
}

export class GelJsDatabase<TSchema extends Record<string, unknown> = Record<string, never>>
	extends GelDatabase<GelQueryResultHKT, TSchema>
{
	static override readonly [entityKind]: string = 'GelJsDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends GelClient = GelClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): GelJsDatabase<TSchema> & {
	$client: GelClient extends TClient ? Client : TClient;
} {
	const dialect = new GelDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const driver = new GelDriver(client, dialect, { logger, cache: config.cache });
	const session = driver.createSession(schema);
	const db = new GelJsDatabase(dialect, session, schema as any) as GelJsDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends GelClient = Client,
>(
	...params:
		| [TClient | string]
		| [TClient | string, DrizzleConfig<TSchema>]
		| [
			& DrizzleConfig<TSchema>
			& (
				| {
					connection: string | ConnectOptions;
				}
				| {
					client: TClient;
				}
			),
		]
): GelJsDatabase<TSchema> & {
	$client: GelClient extends TClient ? Client : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createClient({ dsn: params[0] });

		return construct(instance, params[1] as DrizzleConfig<TSchema> | undefined) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as (
			& ({ connection?: ConnectOptions | string; client?: TClient })
			& DrizzleConfig<TSchema>
		);

		if (client) return construct(client, drizzleConfig);

		const instance = createClient(connection);

		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): GelJsDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
