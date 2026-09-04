import type { QueryResult, ShapeSpec } from '@drizzle-team/minipg';
import type { BatchItem } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, type PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';

export interface PostgresHttpClient {
	query(sql: string, params: unknown[], opts: { mode: 'array'; shape?: ShapeSpec }): Promise<QueryResult<any>>;
	query(sql: string, params: unknown[], opts: { mode: 'object'; shape?: ShapeSpec }): Promise<QueryResult<any>>;
}

export interface PostgresHttpBatchQuery {
	sql: string;
	params?: unknown[];
	mode?: 'array' | 'object';
	shape?: ShapeSpec;
}

export interface PostgresHttpBatchOptions {
	isolation?: 'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted';
	readOnly?: boolean;
	deferrable?: boolean;
	timeout?: number;
	signal?: AbortSignal;
}

export type PostgresHttpBatchRunner = (
	queries: PostgresHttpBatchQuery[],
	options?: PostgresHttpBatchOptions,
) => Promise<QueryResult<any>[]>;

export interface PostgresHttpSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PostgresHttpSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<PostgresHttpQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresHttpSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: PostgresHttpClient,
		private runBatch: PostgresHttpBatchRunner,
		dialect: PgDialect,
		_relations: TRelations,
		options: PostgresHttpSessionOptions = {},
	) {
		super(dialect);
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
		shape?: ShapeSpec,
	) {
		const executor = async (params?: unknown[]) => {
			const q = mode === 'arrays'
				? this.client.query(
					query.sql,
					params ?? [],
					{ mode: 'array', shape },
				)
				: this.client.query(
					query.sql,
					params ?? [],
					{ mode: 'object', shape },
				);

			if (mode === 'raw') return q;
			return q.then((r) => r.rows);
		};

		return new PostgresHttpPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			shape,
		);
	}

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
		options?: PostgresHttpBatchOptions,
	) {
		const preparedQueries: PostgresHttpPreparedQuery<any>[] = new Array(queries.length);
		const builtQueries: PostgresHttpBatchQuery[] = new Array(queries.length);

		for (let i = 0; i < queries.length; ++i) {
			const preparedQuery = queries[i]!._prepare() as PostgresHttpPreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			preparedQueries[i] = preparedQuery;
			builtQueries[i] = {
				sql: builtQuery.sql,
				params: builtQuery.params,
				mode: preparedQuery.mode === 'arrays' ? 'array' : 'object',
				shape: preparedQuery.shape,
			};
		}

		const batchResults = await this.runBatch(builtQueries, options);
		const response = new Array(batchResults.length);
		for (let i = 0; i < batchResults.length; ++i) {
			const { mapper, mode } = preparedQueries[i]!;
			const result = batchResults[i]!;

			response[i] = mapper
				? mapper(result.rows)
				: mode === 'raw'
				? result
				: result.rows;
		}

		return response;
	}

	override async transaction<T>(
		_transaction: (tx: PgAsyncTransaction<PostgresHttpQueryResultHKT, TRelations>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error(
			'No interactive transactions support in postgres HTTP drivers. Use `db.batch(...)` for an atomic set of statements, or a wire-protocol driver (`postgres`, `postgres/neon-ws`, `postgres/cf`, `postgres/deno`) for interactive transactions',
		);
	}
}

export type PostgresHttpQueryResult<T> = Omit<QueryResult<T>, 'metrics' | 'debug'>;

export interface PostgresHttpQueryResultHKT extends PgQueryResultHKT {
	type: Simplify<Omit<QueryResult<this['row']>, 'metrics' | 'debug'>>;
}

export class PostgresHttpPreparedQuery<T extends PreparedQueryConfig> extends PgAsyncPreparedQuery<T> {
	static override readonly [entityKind]: string = 'PostgresHttpPreparedQuery';

	constructor(
		executor: (params?: unknown[]) => Promise<any>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
		logger: Logger,
		// cache instance
		cache: Cache | undefined,
		// per query related metadata
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		cacheConfig: WithCacheConfig | undefined,
		readonly shape?: ShapeSpec,
	) {
		super(executor, query, mapper, mode, logger, cache, queryMetadata, cacheConfig);
	}
}
