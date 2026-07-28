import type { Connection, PoolQuery, QueryResult, ShapeSpec } from 'minipg';
import { Pool } from 'minipg';
import type { BatchItem } from '~/batch';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';
export type PostgresClient = Pool | Connection;

export interface PostgresSessionOptions {
	logger?: Logger;
	cache?: Cache;
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
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
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
		);
	}

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(queries: T) {
		const preparedQueries: PostgresPreparedQuery<any>[] = [];
		const builtQueries: PoolQuery[] = Array.from({ length: preparedQueries.length });

		const q = this.client;
		if (!(q instanceof Pool)) throw new Error('`batch` method is only supported on connection pools!'); // oxlint-disable-line no-instanceof-builtins drizzle-internal/no-instanceof
		for (let i = 0; i < queries.length; ++i) {
			const query = queries[i]!;
			const preparedQuery = query._prepare() as PostgresPreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			preparedQueries[i] = preparedQuery;
			builtQueries[i] = preparedQuery.mode === 'arrays'
				? q.query(builtQuery.sql, builtQuery.params, {
					mode: 'array',
					shape: preparedQuery.shape,
				})
				: q.query(builtQuery.sql, builtQuery.params, {
					mode: 'object',
					shape: preparedQuery.shape,
				});
		}

		const batchResults = await q.batch(builtQueries);
		const response = Array.from({ length: batchResults.length });
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
	type: Simplify<Omit<QueryResult<this['row']>, 'metrics' | 'debug'>>;
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
