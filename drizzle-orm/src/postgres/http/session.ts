import type { QueryResult, ShapeSpec } from '#postgres';
import type { HttpBatchQuery, HttpClient } from '#postgres/http';
import type { BatchItem, SettledQueryResult } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, type PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgRawRow, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';

export interface PostgresHttpRequestOptions {
	/**
	 * Aborts a request that takes longer than this many milliseconds,
	 * rejecting it with a `QUERY_TIMEOUT` error
	 *
	 * Applies to each request on its own: when queries are sent as separate requests, every one gets the full timeout
	 */
	timeout?: number;
	/** Aborts the in-flight request(s) when signalled */
	signal?: AbortSignal;
}

export type PostgresHttpBatchOptions =
	& PostgresHttpRequestOptions
	& (
		| {
			/** `snapshot` cannot be used with `isolation: 'read uncommitted' | 'read committed'` */
			isolation?: 'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted';
			readOnly?: boolean;
			deferrable?: boolean;
			snapshot?: undefined;
		}
		| {
			/** `snapshot` needs `isolation: 'repeatable read' | 'serializable'` */
			isolation: 'serializable' | 'repeatable read';
			readOnly?: boolean;
			deferrable?: boolean;
			/** Run the transaction on a snapshot exported by another transaction (`pg_export_snapshot()`) */
			snapshot: string;
		}
	);

export interface PostgresHttpSessionOptions {
	logger?: Logger;
	cache?: Cache;
	paramsInErrors?: boolean;
}

export class PostgresHttpSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<PostgresHttpQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresHttpSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: HttpClient,
		dialect: PgDialect,
		_relations: TRelations,
		private options: PostgresHttpSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		_name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: QueryMetadata,
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
			this.options.paramsInErrors,
		);
	}

	/** Atomic: runs all queries in one transaction, in a single request */
	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
		options?: PostgresHttpBatchOptions,
	): Promise<any[]> {
		const { prepared, built } = this.buildMulti(queries);
		return this.client.batch(built, options).catch((e) => {
			const index = (e as { failedQueryIndex?: unknown } | null)?.failedQueryIndex;
			const query = typeof index === 'number' ? prepared[index] : undefined;
			if (!query) throw e;
			throw this.queryError(query, e);
		}).then((results) => {
			const response = new Array(results.length);
			for (let i = 0; i < results.length; ++i) {
				const { mapper, mode } = prepared[i]!;
				const result = results[i]!;

				response[i] = mapper
					? mapper(result.rows)
					: mode === 'raw'
					? result
					: result.rows;
			}

			return response;
		});
	}

	/**
	 * Non-atomic: pipelines all queries in a single request, each in it's own autocommit
	 *
	 * Never throws on a query failure: resolves with one `PromiseSettledResult` per query, in input order
	 */
	async pipeline<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
		options?: PostgresHttpRequestOptions,
	): Promise<SettledQueryResult<any>[]> {
		const { prepared, built } = this.buildMulti(queries);
		return this.client.pipeline(built, options).then((results) => {
			const response = new Array(results.length);
			for (let i = 0; i < results.length; ++i) {
				const { mapper, mode } = prepared[i]!;
				const result = results[i]!;
				if (result.status === 'rejected') {
					response[i] = { status: 'rejected', reason: this.queryError(prepared[i]!, result.reason) };
					continue;
				}

				try {
					response[i] = {
						status: 'fulfilled',
						value: mapper
							? mapper(result.value.rows)
							: mode === 'raw'
							? result.value
							: result.value.rows,
					};
				} catch (e) {
					response[i] = { status: 'rejected', reason: this.queryError(prepared[i]!, e) };
				}
			}

			return response;
		});
	}

	/**
	 * Non-atomic: sends every query as its own concurrent request
	 *
	 * Never throws on a query failure: resolves with one `PromiseSettledResult` per query, in input order
	 */
	async parallel<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
		options?: PostgresHttpRequestOptions,
	): Promise<SettledQueryResult<any>[]> {
		const { prepared, built } = this.buildMulti(queries);
		return this.client.parallel(built, options).then((results) => {
			const response = new Array(results.length);
			for (let i = 0; i < results.length; ++i) {
				const { mapper, mode } = prepared[i]!;
				const result = results[i]!;
				if (result.status === 'rejected') {
					response[i] = { status: 'rejected', reason: this.queryError(prepared[i]!, result.reason) };
					continue;
				}

				try {
					response[i] = {
						status: 'fulfilled',
						value: mapper
							? mapper(result.value.rows)
							: mode === 'raw'
							? result.value
							: result.value.rows,
					};
				} catch (e) {
					response[i] = { status: 'rejected', reason: this.queryError(prepared[i]!, e) };
				}
			}

			return response;
		});
	}

	private queryError(prepared: PostgresHttpPreparedQuery<any>, cause: unknown): DrizzleQueryError {
		const { sql, params } = prepared.getQuery();
		return new DrizzleQueryError(sql, this.options.paramsInErrors ? params : undefined, cause as Error);
	}

	private buildMulti(queries: Readonly<BatchItem<'pg'>[]>) {
		const prepared: PostgresHttpPreparedQuery<any>[] = new Array(queries.length);
		const built: HttpBatchQuery[] = new Array(queries.length);
		for (let i = 0; i < queries.length; ++i) {
			const preparedQuery = queries[i]!._prepare() as PostgresHttpPreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			prepared[i] = preparedQuery;
			built[i] = {
				sql: builtQuery.sql,
				params: builtQuery.params,
				mode: preparedQuery.mode === 'arrays' ? 'array' : 'object',
				shape: preparedQuery.shape,
			};
		}

		return { prepared, built };
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
	type: Simplify<Omit<QueryResult<PgRawRow<this['row']>>, 'metrics' | 'debug'>>;
}

export class PostgresHttpPreparedQuery<T extends PreparedQueryConfig> extends PgAsyncPreparedQuery<T> {
	static override readonly [entityKind]: string = 'PostgresHttpPreparedQuery';

	constructor(
		executor: (params?: unknown[]) => Promise<any>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		logger: Logger,
		// cache instance
		cache: Cache | undefined,
		// per query related metadata
		queryMetadata: QueryMetadata | undefined,
		// config that was passed through $withCache
		cacheConfig: WithCacheConfig | undefined,
		readonly shape?: ShapeSpec,
		paramsInErrors?: boolean,
	) {
		super(executor, query, mapper, mode, logger, cache, queryMetadata, cacheConfig, paramsInErrors);
	}
}
