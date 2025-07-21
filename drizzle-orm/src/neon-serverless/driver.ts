import { neonConfig, Pool, type PoolConfig } from '@neondatabase/serverless';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type { NeonClient, NeonQueryResultHKT } from './session.ts';
import { NeonSession } from './session.ts';

export interface NeonDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class NeonDriver {
	static readonly [entityKind]: string = 'NeonDriver';

	constructor(
		private client: NeonClient,
		private dialect: PgDialect,
		private options: NeonDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NeonSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NeonSession(this.client, this.dialect, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}
}

export class NeonDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<NeonQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'NeonServerlessDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NeonClient = NeonClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NeonDatabase<TSchema> & {
	$client: NeonClient extends TClient ? Pool : TClient;
} {
	const dialect = new PgDialect({ casing: config.casing });
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

	const driver = new NeonDriver(client, dialect, { logger, cache: config.cache });
	const session = driver.createSession(schema);
	const db = new NeonDatabase(dialect, session, schema as any) as NeonDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NeonClient = Pool,
>(
	...params: [
		TClient | string,
	] | [
		TClient | string,
		DrizzleConfig<TSchema>,
	] | [
		(
			& DrizzleConfig<TSchema>
			& ({
				connection: string | PoolConfig;
			} | {
				client: TClient;
			})
			& {
				ws?: any;
			}
		),
	]
): NeonDatabase<TSchema> & {
	$client: NeonClient extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new Pool({
			connectionString: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ws, ...drizzleConfig } = params[0] as {
			connection?: PoolConfig | string;
			ws?: any;
			client?: TClient;
		} & DrizzleConfig<TSchema>;

		if (ws) {
			neonConfig.webSocketConstructor = ws;
		}

		if (client) return construct(client, drizzleConfig);

		const instance = typeof connection === 'string'
			? new Pool({
				connectionString: connection,
			})
			: new Pool(connection);

		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): NeonDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
