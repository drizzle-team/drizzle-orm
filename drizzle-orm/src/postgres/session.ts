import type { Connection, Pool, PoolQuery, QueryResult, ShapeSpec } from '#postgres';
import { isBrand } from '#postgres/brand';
import type { BatchItem, SettledQueryResult } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgRawRow, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';
export type PostgresClient = Pool | Connection;

export type PostgresBatchOptions =
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
	};

export interface PostgresSessionOptions {
	logger?: Logger;
	cache?: Cache;
	paramsInErrors?: boolean;
}

export class PostgresSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: PostgresClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: PostgresSessionOptions = {},
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
		queryMetadata?: QueryMetadata,
		cacheConfig?: WithCacheConfig,
		shape?: ShapeSpec,
	) {
		const queryName = typeof name === 'string'
			? name
			: name === true
			? preparedStatementName(query.sql, query.params)
			: undefined;

		const executor = async (params?: unknown[]) => {
			const q = mode === 'arrays'
				? this.client.query(
					query.sql,
					params ?? [],
					{ name: queryName, mode: 'array', shape },
				)
				: this.client.query(
					query.sql,
					params ?? [],
					{ name: queryName, mode: 'object', shape },
				);

			if (mode === 'raw') return q;
			return q.then((r) => r.rows);
		};

		return new PostgresPreparedQuery<T>(
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

	/** Atomic: runs all queries in one transaction on a single pooled connection */
	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
		options?: PostgresBatchOptions,
	): Promise<any[]> {
		const { pool, prepared, built } = this.buildMulti('batch', queries);
		return pool.batch(built, options).catch((e) => {
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
	 * Non-atomic: pipelines all queries on a single pooled connection, each in it's own autocommit
	 *
	 * Never throws on a query failure: resolves with one `PromiseSettledResult` per query, in input order
	 */
	async pipeline<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
	): Promise<SettledQueryResult<any>[]> {
		const { pool, prepared, built } = this.buildMulti('pipeline', queries);
		return pool.pipeline(built).then((results) => {
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
	 * Non-atomic: fans queries out across pooled connections concurrently
	 *
	 * Never throws on a query failure: resolves with one `PromiseSettledResult` per query, in input order
	 */
	async parallel<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
	): Promise<SettledQueryResult<any>[]> {
		const { pool, prepared, built } = this.buildMulti('parallel', queries);
		return pool.parallel(built).then((results) => {
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

	private queryError(prepared: PostgresPreparedQuery<any>, cause: unknown): DrizzleQueryError {
		const { sql, params } = prepared.getQuery();
		return new DrizzleQueryError(sql, this.options.paramsInErrors ? params : undefined, cause as Error);
	}

	private buildMulti(method: 'batch' | 'pipeline' | 'parallel', queries: Readonly<BatchItem<'pg'>[]>) {
		const pool = this.client;
		// `instanceof Pool` would load the bundled client for a pool from the standalone package.
		if (!isBrand<Pool>(pool, 'Pool')) throw new Error(`\`${method}\` method is only supported on connection pools!`);

		const prepared: PostgresPreparedQuery<any>[] = new Array(queries.length);
		const built: PoolQuery[] = new Array(queries.length);
		for (let i = 0; i < queries.length; ++i) {
			const preparedQuery = queries[i]!._prepare() as PostgresPreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			prepared[i] = preparedQuery;
			built[i] = preparedQuery.mode === 'arrays'
				? pool.query(builtQuery.sql, builtQuery.params, {
					mode: 'array',
					shape: preparedQuery.shape,
				})
				: pool.query(builtQuery.sql, builtQuery.params, {
					mode: 'object',
					shape: preparedQuery.shape,
				});
		}

		return { pool, prepared, built };
	}

	override async transaction<T>(
		transaction: (tx: PostgresTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		return this.client.transaction({
			deferrable: config?.deferrable,
			isolation: config?.isolationLevel,
			readOnly: config?.accessMode === 'read only',
		}, async (clTx) => {
			const session = new PostgresSession(clTx, this.dialect, this.relations, this.options);
			const tx = new PostgresTransaction<TRelations>(
				this.dialect,
				session,
				this.relations,
				undefined,
				false,
			);

			if (typeof config?.snapshot === 'string') {
				await tx.execute(tx.setTransactionSnapshotSQL(config.snapshot));
			}

			return transaction(tx);
		});
	}
}

export class PostgresTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresTransaction';

	override async transaction<T>(
		transaction: (tx: PostgresTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		return this.session.transaction(transaction as any);
	}
}

export type PostgresQueryResult<T> = Omit<QueryResult<T>, 'metrics' | 'debug'>;

export interface PostgresQueryResultHKT extends PgQueryResultHKT {
	type: Simplify<Omit<QueryResult<PgRawRow<this['row']>>, 'metrics' | 'debug'>>;
}

export class PostgresPreparedQuery<T extends PreparedQueryConfig> extends PgAsyncPreparedQuery<T> {
	static override readonly [entityKind]: string = 'PostgresPreparedQuery';

	constructor(
		executor: (params?: unknown[]) => Promise<any>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
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
