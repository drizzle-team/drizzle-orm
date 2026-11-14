import type { ClickHouseClientConfigOptions, ClickHouseSettings } from '@clickhouse/client';
import { createClient } from '@clickhouse/client';
import type { Cache } from '~/cache/core/cache.ts';
import { ClickHouseDatabase } from '~/clickhouse-core/db.ts';
import { ClickHouseDialect } from '~/clickhouse-core/dialect.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type {
	ClickHouseDriverClient,
	ClickHouseDriverPreparedQueryHKT,
	ClickHouseDriverQueryResultHKT,
} from './session.ts';
import { ClickHouseDriverSession } from './session.ts';

export interface ClickHouseDriverOptions {
	logger?: Logger;
	cache?: Cache;
	settings?: ClickHouseSettings;
}

export class ClickHouseDriver {
	static readonly [entityKind]: string = 'ClickHouseDriver';

	constructor(
		private client: ClickHouseDriverClient,
		private dialect: ClickHouseDialect,
		private options: ClickHouseDriverOptions = {},
	) {}

	createSession(): ClickHouseDriverSession {
		return new ClickHouseDriverSession(this.client, this.dialect, {
			logger: this.options.logger,
			cache: this.options.cache,
			settings: this.options.settings,
		});
	}
}

export { ClickHouseDatabase } from '~/clickhouse-core/db.ts';

export class ClickHouseDriverDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends ClickHouseDatabase<ClickHouseDriverQueryResultHKT, ClickHouseDriverPreparedQueryHKT, TSchema> {
	static override readonly [entityKind]: string = 'ClickHouseDriverDatabase';
}

export type ClickHouseDrizzleConfig<TSchema extends Record<string, unknown> = Record<string, never>> =
	& Omit<DrizzleConfig<TSchema>, 'schema'>
	& {
		/** Settings applied to every statement Drizzle issues. */
		settings?: ClickHouseSettings;
	}
	& ({ schema: TSchema } | { schema?: undefined });

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends ClickHouseDriverClient = ClickHouseDriverClient,
>(
	client: TClient,
	config: ClickHouseDrizzleConfig<TSchema> = {},
): ClickHouseDriverDatabase<TSchema> & { $client: TClient } {
	const dialect = new ClickHouseDialect({ casing: config.casing });

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

	const driver = new ClickHouseDriver(client, dialect, { logger, cache: config.cache, settings: config.settings });
	const session = driver.createSession();
	const db = new ClickHouseDriverDatabase(dialect, session, schema as any) as ClickHouseDriverDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

/**
 * Connects Drizzle to ClickHouse through `@clickhouse/client`.
 *
 * Accepts an existing client, a connection URL, or the client's own config object:
 *
 * ```ts
 * const db = drizzle(process.env.CLICKHOUSE_URL!);
 * const db = drizzle({ connection: { url: 'http://localhost:8123', username: 'default' }, schema });
 * const db = drizzle(createClient({ url }), { schema });
 * ```
 */
export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends ClickHouseDriverClient = ClickHouseDriverClient,
>(
	...params: [
		TClient | string,
	] | [
		TClient | string,
		ClickHouseDrizzleConfig<TSchema>,
	] | [
		(
			& ClickHouseDrizzleConfig<TSchema>
			& ({
				connection: string | ClickHouseClientConfigOptions;
			} | {
				client: TClient;
			})
		),
	]
): ClickHouseDriverDatabase<TSchema> & { $client: TClient } {
	if (typeof params[0] === 'string') {
		const instance = createClient({ url: params[0] });
		return construct(instance as any, params[1] as ClickHouseDrizzleConfig<TSchema>) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& { connection?: ClickHouseClientConfigOptions | string; client?: TClient }
			& ClickHouseDrizzleConfig<TSchema>;

		if (client) return construct(client, drizzleConfig) as any;

		const instance = typeof connection === 'string'
			? createClient({ url: connection })
			: createClient(connection);

		return construct(instance as any, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as ClickHouseDrizzleConfig<TSchema>) as any;
}

export namespace drizzle {
	/**
	 * Builds a database that throws on every query, for typing schemas in environments that must not
	 * open a connection.
	 */
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: ClickHouseDrizzleConfig<TSchema>,
	): ClickHouseDriverDatabase<TSchema> & { $client: '$client is not available on drizzle.mock()' } {
		return construct({} as any, config) as any;
	}
}
