import type { CustomTypesConfig, FullQueryResults, NeonQueryPromise, Pool, PoolClient } from '@neondatabase/serverless';
import { neonConfig, types } from '@neondatabase/serverless';
import type { BatchItem } from '~/batch.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { NeonHttpClient, NeonHttpQueryResultHKT, NeonHttpSessionOptions } from '~/neon-http/session.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';

/**
 * Ensures a WebSocket implementation is available for Neon's
 * serverless driver. The Neon driver checks for a global WebSocket
 * automatically, but this sets it on neonConfig explicitly so the
 * check only happens once.
 */
function ensureWebSocket(): void {
	if (neonConfig.webSocketConstructor) return;

	if (typeof WebSocket !== 'undefined') {
		neonConfig.webSocketConstructor = WebSocket as any;
	}
}

export type NetlifyDbClient = {
	http: NeonHttpClient;
	pool: Pool;
};

export interface NetlifyDbSessionOptions extends NeonHttpSessionOptions {
	useJitMappers?: boolean | undefined;
	transactionCodecs?: PgCodecs | undefined;
}

export class NetlifyDbSession<TRelations extends AnyRelations>
	extends PgAsyncSession<NeonHttpQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'NetlifyDbSession';

	private clientQuery: (sql: string, params: any[], opts: Record<string, any>) => NeonQueryPromise<any, any>;
	private logger: Logger;
	private cache: Cache;

	constructor(
		readonly httpClient: NeonHttpClient,
		readonly pool: Pool,
		dialect: PgDialect,
		private relations: TRelations,
		readonly options: NetlifyDbSessionOptions,
	) {
		super(dialect);
		// `httpClient.query` is for @neondatabase/serverless v1.0.0 and up, where the
		// root query function `httpClient` is only usable as a template function;
		// `httpClient` is a fallback for earlier versions
		this.clientQuery = (httpClient as any).query ?? httpClient as any;
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		_name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		const executor = (params?: unknown[]) => {
			if (mode === 'raw') {
				// otherwise raw queries with .then crash due to .then not existing on raw mode queries
				return (async () =>
					this.httpClient(query.sql, params, {
						arrayMode: false,
						fullResults: true,
						authToken: this.options.authToken,
					}))();
			}

			return this.httpClient(query.sql, params, {
				arrayMode: mode === 'arrays',
				fullResults: true,
				authToken: this.options.authToken,
			}).then((it: any) => it.rows);
		};

		return new PgAsyncPreparedQuery(executor, query, mapper, mode, this.logger, this.cache, queryMetadata, cacheConfig);
	}

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(queries: T) {
		const preparedQueries: PgAsyncPreparedQuery<any>[] = [];
		const builtQueries: NeonQueryPromise<any, true>[] = [];
		const q = this.httpClient;

		for (const query of queries) {
			const preparedQuery = query._prepare() as PgAsyncPreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push(
				q(builtQuery.sql, builtQuery.params, {
					fullResults: true,
					arrayMode: preparedQuery.mode === 'arrays',
				}),
			);
		}

		const batchResults = await this.httpClient.transaction(builtQueries, {
			authToken: this.options.authToken,
			fullResults: true,
			arrayMode: true,
		});
		return batchResults.map((result, i) =>
			preparedQueries[i]!.mapper ? preparedQueries[i]!.mapper(result.rows) : result
		) as any;
	}

	async query(query: string, params: unknown[]): Promise<FullQueryResults<true>> {
		this.logger.logQuery(query, params);
		const result = await this.clientQuery(query, params, { arrayMode: true, fullResults: true });
		return result;
	}

	async queryObjects(
		query: string,
		params: unknown[],
	): Promise<FullQueryResults<false>> {
		return this.clientQuery(query, params, { arrayMode: false, fullResults: true });
	}

	override async transaction<T>(
		transaction: (tx: NetlifyDbTransaction<TRelations>) => Promise<T>,
		config: PgTransactionConfig = {},
	): Promise<T> {
		ensureWebSocket();
		const poolClient = await this.pool.connect();
		const dialect = new PgDialect({
			useJitMappers: this.options.useJitMapper,
			codecs: this.options.transactionCodecs,
		});
		const session = new NetlifyDbWsSession<TRelations>(
			poolClient,
			dialect,
			this.relations,
			this.options,
		);
		const tx = new NetlifyDbTransaction<TRelations>(
			dialect,
			session,
			this.relations,
			undefined,
			false,
		);
		await tx.execute(sql`begin ${tx.getTransactionConfigSQL(config)}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		} finally {
			poolClient.release();
		}
	}
}

const noop = (val: any) => val;
const typeConfig: CustomTypesConfig = {
	getTypeParser: <CustomTypesConfig['getTypeParser']> ((typeId, format) => {
		switch (typeId as number) {
			case types.builtins.TIMESTAMPTZ:
			case types.builtins.TIMESTAMP:
			case types.builtins.DATE:
			case types.builtins.INTERVAL:
			case 1231: // numeric[]
			case 1115: // timestamp[]
			case 1185: // timestamp with timezone[]
			case 1187: // interval[]
			case 1182: // date[]
				return noop;
			default:
				return types.getTypeParser(typeId, format as any);
		}
	}),
};

/**
 * Internal WebSocket-based session used only within transactions.
 * Delegates all queries to a PoolClient over WebSocket, using
 * NeonPreparedQuery from the neon-serverless adapter.
 */
export class NetlifyDbWsSession<TRelations extends AnyRelations>
	extends PgAsyncSession<NeonHttpQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'NetlifyDbWsSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: PoolClient,
		dialect: PgDialect,
		private relations: TRelations,
		options: NeonHttpSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		const queryName = typeof name === 'string'
			? name
			: name === true
			? preparedStatementName(query.sql, query.params)
			: undefined;

		const executor = async (params?: unknown[]) => {
			return this.client.query({
				name: queryName,
				rowMode: mode === 'arrays' ? 'array' : undefined as any,
				text: query.sql,
				types: typeConfig,
			}, params).then((r) => mode === 'raw' ? r : r.rows);
		};

		return new PgAsyncPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		);
	}
	override async transaction<T>(
		_transaction: (tx: NetlifyDbTransaction<TRelations>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error('Nested transactions are handled by NetlifyDbTransaction via savepoints');
	}
}

export class NetlifyDbTransaction<TRelations extends AnyRelations>
	extends PgAsyncTransaction<NeonHttpQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'NetlifyDbTransaction';

	override transaction = async <T>(
		transaction: (tx: NetlifyDbTransaction<TRelations>) => Promise<T>,
	): Promise<T> => {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NetlifyDbTransaction<TRelations>(
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
			false,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (e) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw e;
		}
	};
}
