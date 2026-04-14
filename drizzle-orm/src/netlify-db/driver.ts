import { type HTTPQueryOptions, neon, Pool, types } from '@neondatabase/serverless';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { NeonHttpClient, NeonHttpQueryResultHKT } from '~/neon-http/session.ts';
import { drizzle as drizzleNodePg, type NodePgDatabase } from '~/node-postgres/driver.ts';
import type { NodePgClient } from '~/node-postgres/session.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { type PgCodecs, refineGenericPgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { isConfig } from '~/utils.ts';
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

export interface DrizzleNetlifyConfig<TRelations extends AnyRelations = EmptyRelations>
	extends DrizzlePgConfig<TRelations>
{
	/** Netlify utilizes different driver for transactions, thus requiring separate set of codecs */
	transactionCodecs?: PgCodecs | undefined;
}

export class NetlifyDbDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<NeonHttpQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NetlifyDbDatabase';

	declare session: NetlifyDbSession<TRelations>;

	$withAuth(
		token: Exclude<HTTPQueryOptions<true, true>['authToken'], undefined>,
	): Omit<this, '$withAuth'> {
		const session = new NetlifyDbSession(this.session.httpClient, this.session.pool, this.dialect, this._.relations, {
			...this.session.options,
			authToken: token,
		});

		return new NetlifyDbDatabase(this.dialect, session, this._.relations) as any;
	}

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(
			batch,
		) as Promise<BatchResponse<T>>;
	}
}

export const netlifyDbCodecs = refineGenericPgCodecs({
	bytea: {
		normalizeParam: String,
	},
	json: {
		normalizeParam: (v) => JSON.stringify(v),
	},
	jsonb: {
		normalizeParam: (v) => JSON.stringify(v),
	},
});

export const netlifyDbTransactionCodecs = refineGenericPgCodecs();

function construct<
	TRelations extends AnyRelations = EmptyRelations,
>(
	httpClient: NeonHttpClient,
	pool: Pool,
	config: DrizzleNetlifyConfig<TRelations> = {},
): NetlifyDbDatabase<TRelations> & {
	$client: NetlifyDbClient;
} {
	const dialect = new PgDialect({
		codecs: config.codecs ?? netlifyDbCodecs,
		useJitMappers: config.useJitMappers,
	});

	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}
	const relations = config.relations ?? {} as TRelations;

	const session = new NetlifyDbSession(httpClient, pool, dialect, relations ?? {}, {
		logger: logger,
		cache: config.cache,
		transactionCodecs: config.transactionCodecs ?? netlifyDbTransactionCodecs,
	});

	types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
	types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
	types.setTypeParser(types.builtins.DATE, (val) => val);
	types.setTypeParser(types.builtins.INTERVAL, (val) => val);
	types.setTypeParser(1231, (val) => val);
	types.setTypeParser(1115, (val) => val);
	types.setTypeParser(1185, (val) => val);
	types.setTypeParser(1187, (val) => val);
	types.setTypeParser(1182, (val) => val);

	const db = new NetlifyDbDatabase(
		dialect,
		session,
		relations,
	);
	(<any> db).$client = { http: httpClient, pool } satisfies NetlifyDbClient;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
>():
	| (NetlifyDbDatabase<TRelations> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TRelations> & { $client: NodePgClient });

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
>(
	config: DrizzleNetlifyConfig<TRelations>,
):
	| (NetlifyDbDatabase<TRelations> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TRelations> & { $client: NodePgClient });

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
>(
	config: DrizzleNetlifyConfig<TRelations> & { client: ServerlessDrizzleClient },
): NetlifyDbDatabase<TRelations> & { $client: NetlifyDbClient };

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
>(
	config: DrizzleNetlifyConfig<TRelations> & { client: ServerDrizzleClient },
): NodePgDatabase<TRelations> & { $client: NodePgClient };

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
>(
	config: DrizzleNetlifyConfig<TRelations> & { client: DrizzleClient },
):
	| (NetlifyDbDatabase<TRelations> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TRelations> & { $client: NodePgClient });

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleNetlifyConfig<TRelations>,
	] | [
		(
			& DrizzleNetlifyConfig<TRelations>
			& ({
				connection: string | { connectionString: string };
			} | {
				client: NetlifyDbClient | DrizzleClient;
			})
		),
	]
): NetlifyDbDatabase<TRelations> & { $client: NetlifyDbClient };

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	...params: [] | [
		DrizzleNetlifyConfig<TRelations>,
	] | [
		string,
	] | [
		string,
		DrizzleNetlifyConfig<TRelations>,
	] | [
		(
			& DrizzleNetlifyConfig<TRelations>
			& ({
				connection: string | { connectionString: string };
			} | {
				client: NetlifyDbClient | DrizzleClient;
			})
		),
	]
):
	| (NetlifyDbDatabase<TRelations> & { $client: NetlifyDbClient })
	| (NodePgDatabase<TRelations> & { $client: NodePgClient })
{
	// Zero-config: read env vars
	if (
		params.length === 0
		|| (params.length === 1 && isConfig(params[0]) && !('connection' in (params[0] as any))
			&& !('client' in (params[0] as any)))
	) {
		const drizzleConfig = (params[0] ?? {}) as DrizzleNetlifyConfig<TRelations>;
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
		} & DrizzleNetlifyConfig<TRelations>;

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
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleNetlifyConfig<TRelations>,
	): NetlifyDbDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, {} as any, config) as any;
	}
}
