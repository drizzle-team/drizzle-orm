import { neon, Pool, types } from '@neondatabase/serverless';
import { getDatabase } from '@netlify/database';
import * as V1 from '~/_relations.ts';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { NeonHttpClient, NeonHttpQueryResultHKT } from '~/neon-http/session.ts';
import { drizzle as drizzleNodePg, type NodePgDatabase } from '~/node-postgres/driver.ts';
import type { NodePgClient } from '~/node-postgres/session.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
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
		relations: AnyRelations | undefined,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): NetlifyDbSession<Record<string, unknown>, EmptyRelations, V1.TablesRelationalConfig> {
		return new NetlifyDbSession(this.httpClient, this.pool, this.dialect, relations ?? {}, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
		types.setTypeParser(types.builtins.INTERVAL, (val) => val);
		types.setTypeParser(1231, (val) => val);
		types.setTypeParser(1115, (val) => val);
		types.setTypeParser(1185, (val) => val);
		types.setTypeParser(1187, (val) => val);
		types.setTypeParser(1182, (val) => val);
	}
}

export class NetlifyDbDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<NeonHttpQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'NetlifyDbDatabase';

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return (<NetlifyDbSession<TSchema, TRelations, V1.ExtractTablesWithRelations<TSchema>>> this.session).batch(
			batch,
		) as Promise<BatchResponse<T>>;
	}
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	httpClient: NeonHttpClient,
	pool: Pool,
	config: DrizzleConfig<TSchema, TRelations> = {},
): NetlifyDbDatabase<TSchema, TRelations> & {
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

	const relations = config.relations ?? {} as TRelations;

	const driver = new NetlifyDbDriver(httpClient, pool, dialect, { logger, cache: config.cache });
	const session = driver.createSession(relations, schema);

	const db = new NetlifyDbDatabase(
		dialect,
		session,
		relations,
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
	TRelations extends AnyRelations = EmptyRelations,
>():
	| (NetlifyDbDatabase<TSchema, TRelations> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TSchema, TRelations> & { $client: NodePgClient });

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	config: DrizzleConfig<TSchema, TRelations>,
):
	| (NetlifyDbDatabase<TSchema, TRelations> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TSchema, TRelations> & { $client: NodePgClient });

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	config: DrizzleConfig<TSchema, TRelations> & { client: ServerlessDrizzleClient },
): NetlifyDbDatabase<TSchema, TRelations> & { $client: NetlifyDbClient };

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	config: DrizzleConfig<TSchema, TRelations> & { client: ServerDrizzleClient },
): NodePgDatabase<TSchema, TRelations> & { $client: NodePgClient };

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	config: DrizzleConfig<TSchema, TRelations> & { client: DrizzleClient },
):
	| (NetlifyDbDatabase<TSchema, TRelations> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TSchema, TRelations> & { $client: NodePgClient });

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | { connectionString: string };
			} | {
				client: NetlifyDbClient | DrizzleClient;
			})
		),
	]
): NetlifyDbDatabase<TSchema, TRelations> & { $client: NetlifyDbClient };

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	...params: [] | [
		DrizzleConfig<TSchema>,
	] | [
		string,
	] | [
		string,
		DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | { connectionString: string };
			} | {
				client: NetlifyDbClient | DrizzleClient;
			})
		),
	]
):
	| (NetlifyDbDatabase<TSchema, TRelations> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TSchema, TRelations> & { $client: NodePgClient })
{
	// Zero-config: delegate to @netlify/database
	if (
		params.length === 0
		|| (params.length === 1 && isConfig(params[0]) && !('connection' in (params[0] as any))
			&& !('client' in (params[0] as any)))
	) {
		const drizzleConfig = (params[0] ?? {}) as DrizzleConfig<TSchema, TRelations>;
		const connection = getDatabase();

		if (connection.driver === 'server') {
			return drizzleNodePg({ client: connection.pool, ...drizzleConfig }) as any;
		}

		return construct(connection.httpClient, connection.pool, drizzleConfig) as any;
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
		} & DrizzleConfig<TSchema, TRelations>;

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
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): NetlifyDbDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, {} as any, config) as any;
	}
}
