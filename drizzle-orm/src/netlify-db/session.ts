import type {
	FullQueryResults,
	NeonQueryPromise,
	Pool,
	PoolClient,
	QueryResult,
	QueryResultRow,
} from '@neondatabase/serverless';
import { neonConfig } from '@neondatabase/serverless';
import type * as V1 from '~/_relations.ts';
import type { BatchItem } from '~/batch.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { NeonHttpClient, NeonHttpQueryResultHKT, NeonHttpSessionOptions } from '~/neon-http/session.ts';
import { NeonHttpPreparedQuery } from '~/neon-http/session.ts';
import { NeonPreparedQuery } from '~/neon-serverless/session.ts';
import { type PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
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

const queryConfig = {
	arrayMode: true,
	fullResults: true,
} as const;

export class NetlifyDbSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<NeonHttpQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'NetlifyDbSession';

	private clientQuery: (sql: string, params: any[], opts: Record<string, any>) => NeonQueryPromise<any, any>;
	private logger: Logger;
	private cache: Cache;

	constructor(
		private httpClient: NeonHttpClient,
		private pool: Pool,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: NeonHttpSessionOptions = {},
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
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		return new NeonHttpPreparedQuery(
			this.httpClient,
			query,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
	): PgAsyncPreparedQuery<T> {
		return new NeonHttpPreparedQuery(
			this.httpClient,
			query,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			false,
			customResultMapper,
			true,
		);
	}

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
	) {
		const preparedQueries: PreparedQuery[] = [];
		const builtQueries: NeonQueryPromise<any, true>[] = [];
		for (const query of queries) {
			const preparedQuery = query._prepare();
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push(
				this.clientQuery(builtQuery.sql, builtQuery.params, {
					fullResults: true,
					arrayMode: preparedQuery.isResponseInArrayMode(),
				}),
			);
		}

		const batchResults = await this.httpClient.transaction(builtQueries, queryConfig);

		return batchResults.map((result, i) => preparedQueries[i]!.mapResult(result, true)) as any;
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
		transaction: (tx: NetlifyDbTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config: PgTransactionConfig = {},
	): Promise<T> {
		ensureWebSocket();
		const poolClient = await this.pool.connect();
		const session = new NetlifyDbWsSession<TFullSchema, TRelations, TSchema>(
			poolClient,
			this.dialect,
			this.relations,
			this.schema,
			this.options,
		);
		const tx = new NetlifyDbTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			session,
			this.relations,
			this.schema,
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

/**
 * Internal WebSocket-based session used only within transactions.
 * Delegates all queries to a PoolClient over WebSocket, using
 * NeonPreparedQuery from the neon-serverless adapter.
 */
export class NetlifyDbWsSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<NeonHttpQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'NetlifyDbWsSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: PoolClient,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		options: NeonHttpSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		return new NeonPreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			name,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper?: (rows: Record<string, unknown>[]) => T['execute'],
	): PgAsyncPreparedQuery<T> {
		return new NeonPreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			name,
			false,
			customResultMapper,
			true,
		);
	}

	async query(query: string, params: unknown[]): Promise<QueryResult> {
		this.logger.logQuery(query, params);
		const result = await this.client.query({
			rowMode: 'array',
			text: query,
			values: params,
		});
		return result;
	}

	async queryObjects<T extends QueryResultRow>(
		query: string,
		params: unknown[],
	): Promise<QueryResult<T>> {
		return this.client.query<T>(query, params);
	}

	override async transaction<T>(
		_transaction: (tx: NetlifyDbTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error('Nested transactions are handled by NetlifyDbTransaction via savepoints');
	}
}

export class NetlifyDbTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncTransaction<NeonHttpQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'NetlifyDbTransaction';

	override async transaction<T>(
		transaction: (tx: NetlifyDbTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NetlifyDbTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			this.session,
			this.relations,
			this.schema,
			this.nestedIndex + 1,
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
	}
}
