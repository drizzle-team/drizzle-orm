import { neon, Pool, types } from '@neondatabase/serverless';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { NeonHttpClient, NeonHttpQueryResultHKT } from '~/neon-http/session.ts';
import { drizzle as drizzleNodePg, type NodePgDatabase } from '~/node-postgres/driver.ts';
import type { NodePgClient } from '~/node-postgres/session.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import * as V1 from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import { type NetlifyDbClient, NetlifyDbSession } from './session.ts';

export interface ServerlessDrizzleClient {
	driver: 'serverless';
	httpClient: NeonHttpClient;
	pool: Pool;
	connectionString: string;
}

export interface ServerDrizzleClient {
	driver: 'server';
	pool: NodePgClient;
	connectionString: string;
}

export type DrizzleClient = ServerlessDrizzleClient | ServerDrizzleClient;

export interface NetlifyDbDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class NetlifyDbDriver {
	static readonly [entityKind]: string = 'NetlifyDbDriver';

	constructor(
		private httpClient: NeonHttpClient,
		private pool: Pool,
		private dialect: PgDialect,
		private options: NetlifyDbDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): NetlifyDbSession<Record<string, unknown>, V1.TablesRelationalConfig> {
		return new NetlifyDbSession(this.httpClient, this.pool, this.dialect, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val: any) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val: any) => val);
		types.setTypeParser(types.builtins.DATE, (val: any) => val);
		types.setTypeParser(types.builtins.INTERVAL, (val: any) => val);
		types.setTypeParser(1231, (val: any) => val);
		types.setTypeParser(1115, (val: any) => val);
		types.setTypeParser(1185, (val: any) => val);
		types.setTypeParser(1187, (val: any) => val);
		types.setTypeParser(1182, (val: any) => val);
	}
}

export class NetlifyDbDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<NeonHttpQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'NetlifyDbDatabase';

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return (<NetlifyDbSession<TSchema, V1.ExtractTablesWithRelations<TSchema>>> this.session).batch(
			batch,
		) as Promise<BatchResponse<T>>;
	}
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	httpClient: NeonHttpClient,
	pool: Pool,
	config: DrizzleConfig<TSchema> = {},
): NetlifyDbDatabase<TSchema> & {
	$client: NetlifyDbClient;
} {
	const dialect = new PgDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = V1.extractTablesRelationalConfig(
			config.schema,
			V1.createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const driver = new NetlifyDbDriver(httpClient, pool, dialect, { logger, cache: config.cache });
	const session = driver.createSession(schema);

	const db = new NetlifyDbDatabase(
		dialect,
		session,
		schema as V1.RelationalSchemaConfig<V1.ExtractTablesWithRelations<TSchema>> | undefined,
	);
	(<any> db).$client = { http: httpClient, pool } satisfies NetlifyDbClient;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>():
	| (NetlifyDbDatabase<TSchema> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TSchema> & { $client: NodePgClient });

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	config: DrizzleConfig<TSchema>,
):
	| (NetlifyDbDatabase<TSchema> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TSchema> & { $client: NodePgClient });

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	config: DrizzleConfig<TSchema> & { client: ServerlessDrizzleClient },
): NetlifyDbDatabase<TSchema> & { $client: NetlifyDbClient };

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	config: DrizzleConfig<TSchema> & { client: ServerDrizzleClient },
): NodePgDatabase<TSchema> & { $client: NodePgClient };

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	config: DrizzleConfig<TSchema> & { client: DrizzleClient },
):
	| (NetlifyDbDatabase<TSchema> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TSchema> & { $client: NodePgClient });

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleConfig<TSchema>,
	] | [
		(
			& DrizzleConfig<TSchema>
			& ({
				connection: string | { connectionString: string };
			} | {
				client: NetlifyDbClient | DrizzleClient;
			})
		),
	]
): NetlifyDbDatabase<TSchema> & { $client: NetlifyDbClient };

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	...params: [] | [
		DrizzleConfig<TSchema>,
	] | [
		string,
	] | [
		string,
		DrizzleConfig<TSchema>,
	] | [
		(
			& DrizzleConfig<TSchema>
			& ({
				connection: string | { connectionString: string };
			} | {
				client: NetlifyDbClient | DrizzleClient;
			})
		),
	]
):
	| (NetlifyDbDatabase<TSchema> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TSchema> & { $client: NodePgClient })
{
	// Zero-config: read env vars
	if (
		params.length === 0
		|| (params.length === 1 && isConfig(params[0]) && !('connection' in (params[0] as any))
			&& !('client' in (params[0] as any)))
	) {
		const drizzleConfig = (params[0] ?? {}) as DrizzleConfig<TSchema>;
		const connectionString = process.env['NETLIFY_DB_URL'];

		if (!connectionString) {
			throw new Error(
				'NETLIFY_DB_URL environment variable is not set. '
					+ 'Provide a connection string or client to drizzle().',
			);
		}

		const driver = process.env['NETLIFY_DB_DRIVER'];

		if (driver === 'server') {
			return drizzleNodePg({ connection: connectionString, ...drizzleConfig }) as any;
		}

		const httpClient = neon(connectionString);
		const pool = new Pool({ connectionString });
		return construct(httpClient, pool, drizzleConfig) as any;
	}

	if (typeof params[0] === 'string') {
		const connectionString = params[0];
		const httpClient = neon(connectionString);
		const pool = new Pool({ connectionString });
		return construct(httpClient, pool, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as {
			connection?: { connectionString: string } | string;
			client?: NetlifyDbClient | DrizzleClient;
		} & DrizzleConfig<TSchema>;

		if (client) {
			if ('driver' in client) {
				if (client.driver === 'serverless') {
					return construct(client.httpClient, client.pool, drizzleConfig);
				}
				return drizzleNodePg({ client: client.pool, ...drizzleConfig }) as any;
			}
			return construct(client.http, client.pool, drizzleConfig);
		}

		const connectionString = typeof connection === 'string' ? connection : connection!.connectionString;
		const httpClient = neon(connectionString);
		const pool = new Pool({ connectionString });

		return construct(httpClient, pool, drizzleConfig) as any;
	}

	throw new Error('Invalid arguments. Expected a connection string or a config object.');
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
	>(
		config?: DrizzleConfig<TSchema>,
	): NetlifyDbDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, {} as any, config) as any;
	}
}
