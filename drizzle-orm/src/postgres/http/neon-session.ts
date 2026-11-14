import type { ShapeSpec } from '#postgres';
import type { NeonHttpClient, NeonTxQuery } from '#postgres/neon-http';
import type { BatchItem, SettledQueryResult } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncSession, type PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import {
	type PostgresHttpBatchOptions,
	PostgresHttpPreparedQuery,
	type PostgresHttpQueryResultHKT,
	type PostgresHttpRequestOptions,
	type PostgresHttpSessionOptions,
} from './session.ts';

export class PostgresNeonHttpSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<PostgresHttpQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresNeonHttpSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: NeonHttpClient,
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
		return this.client.transaction(built, options).then((results) => {
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

	// No `pipeline`: Neon's multi-statement endpoint always wraps the set in a transaction (that is `batch`)

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
		const built: NeonTxQuery[] = new Array(queries.length);
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
