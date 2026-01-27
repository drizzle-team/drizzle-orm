import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { DSQLDialect } from '~/dsql-core/dialect.ts';
import { DSQLDeleteBase } from '~/dsql-core/query-builders/delete.ts';
import { DSQLInsertBuilder } from '~/dsql-core/query-builders/insert.ts';
import { DSQLSelectBuilder, type SelectedFields } from '~/dsql-core/query-builders/select.ts';
import type { SelectedFieldsOrdered } from '~/dsql-core/query-builders/select.types.ts';
import { DSQLUpdateBuilder } from '~/dsql-core/query-builders/update.ts';
import {
	DSQLBasePreparedQuery,
	type DSQLQueryResultHKT,
	DSQLSession,
	type PreparedQueryConfig,
} from '~/dsql-core/session.ts';
import type { DSQLTable } from '~/dsql-core/table.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import { TransactionRollbackError } from '~/errors.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQLWrapper } from '~/sql/sql.ts';
import { assertUnreachable, type Assume, mapResultRow } from '~/utils.ts';

/** Result shape returned by pg-compatible query methods */
export interface DSQLQueryResult<T = unknown> {
	rows: T[];
	rowCount?: number;
	command?: string;
}

/** A pg-compatible pool client with release capability */
export interface DSQLPoolClient {
	query(text: string, values?: unknown[]): Promise<DSQLQueryResult<Record<string, unknown>>>;
	query(config: { text: string; values?: unknown[]; rowMode?: 'array' }): Promise<DSQLQueryResult<unknown[]>>;
	release(): void;
}

/**
 * DSQL client interface - compatible with pg Pool or Client.
 * Supports both AWS Aurora DSQL connector pools and standard pg clients.
 */
export interface DSQLClient {
	query(text: string, values?: unknown[]): Promise<DSQLQueryResult<Record<string, unknown>>>;
	query(config: { text: string; values?: unknown[]; rowMode?: 'array' }): Promise<DSQLQueryResult<unknown[]>>;
	/** Optional connect method for pool-based clients to acquire a dedicated connection */
	connect?(): Promise<DSQLPoolClient>;
}

// DSQL optimistic concurrency error codes
const DSQL_RETRYABLE_ERRORS = ['OC000', 'OC001', '40001'];
const DEFAULT_MAX_RETRIES = 10;
const DEFAULT_BASE_DELAY_MS = 50;
const DEFAULT_MAX_DELAY_MS = 5000;

/**
 * Configuration for DSQL retry behavior on optimistic concurrency conflicts.
 */
export interface DSQLRetryConfig {
	/** Maximum number of retry attempts (default: 10) */
	maxRetries?: number;
	/** Base delay in milliseconds for exponential backoff (default: 50) */
	baseDelayMs?: number;
	/** Maximum delay in milliseconds between retries (default: 5000) */
	maxDelayMs?: number;
}

const defaultRetryConfig: Required<DSQLRetryConfig> = {
	maxRetries: DEFAULT_MAX_RETRIES,
	baseDelayMs: DEFAULT_BASE_DELAY_MS,
	maxDelayMs: DEFAULT_MAX_DELAY_MS,
};

function isDSQLRetryableError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const err = error as { code?: string; message?: string };
	// Check PostgreSQL error code
	if (err.code && DSQL_RETRYABLE_ERRORS.includes(err.code)) return true;
	// Check error message for DSQL error codes
	if (err.message) {
		return DSQL_RETRYABLE_ERRORS.some((code) => err.message!.includes(`(${code})`));
	}
	return false;
}

async function withRetry<T>(
	fn: () => Promise<T>,
	config: DSQLRetryConfig = {},
): Promise<T> {
	const { maxRetries, baseDelayMs, maxDelayMs } = { ...defaultRetryConfig, ...config };
	let lastError: unknown;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isDSQLRetryableError(error) || attempt === maxRetries) {
				throw error;
			}
			// Exponential backoff with jitter, capped at maxDelayMs
			const delay = Math.min(
				baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5),
				maxDelayMs,
			);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
	throw lastError;
}

export class DSQLPreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends DSQLBasePreparedQuery
{
	static override readonly [entityKind]: string = 'DSQLPreparedQuery';

	private cache: Cache | undefined;
	private queryMetadata: {
		type: 'select' | 'update' | 'delete' | 'insert';
		tables: string[];
	} | undefined;
	private cacheConfig: WithCacheConfig | undefined;
	private retryConfig: DSQLRetryConfig;

	constructor(
		private client: DSQLClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		private _isResponseInArrayMode: boolean,
		retryConfig: DSQLRetryConfig,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super({ sql: queryString, params });
		this.cache = cache;
		this.queryMetadata = queryMetadata;
		this.retryConfig = retryConfig;
		// Enable caching by default when cache strategy is 'all'
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		} else {
			this.cacheConfig = cacheConfig;
		}
		// Disable caching if explicitly disabled
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);

		const { fields, customResultMapper, isRqbV2Query, retryConfig } = this;

		// If no fields and no custom mapper, return raw result with retry and caching
		if (!fields && !customResultMapper) {
			return this.queryWithCache(
				this.queryString,
				params,
				() => withRetry(() => this.client.query(this.queryString, params), retryConfig),
			);
		}

		// For RQB v2 queries, use object mode with retry (no caching for relational queries)
		if (isRqbV2Query) {
			const result = await withRetry(() => this.client.query(this.queryString, params), retryConfig);
			return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(result.rows);
		}

		// Use array mode for select queries with fields, with retry and caching
		const result = await this.queryWithCache(this.queryString, params, () =>
			withRetry(() =>
				this.client.query({
					text: this.queryString,
					values: params,
					rowMode: 'array',
				}), retryConfig));

		return customResultMapper
			? (customResultMapper as (rows: unknown[][]) => T['execute'])(result.rows)
			: result.rows.map((row) => mapResultRow<T['execute']>(fields!, row, this.joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);
		return this.queryWithCache(
			this.queryString,
			params,
			() => withRetry(() => this.client.query(this.queryString, params), this.retryConfig),
		).then((result) => result.rows);
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}

	/** @internal */
	protected async queryWithCache<TResult>(
		queryString: string,
		params: any[],
		query: () => Promise<TResult>,
	): Promise<TResult> {
		const cacheStrat = this.cache !== undefined && !is(this.cache, NoopCache)
			? await strategyFor(queryString, params, this.queryMetadata, this.cacheConfig)
			: { type: 'skip' as const };

		if (cacheStrat.type === 'skip') {
			return query().catch((e) => {
				throw new DrizzleQueryError(queryString, params, e as Error);
			});
		}

		const cache = this.cache!;

		// For mutate queries, we should query the database, wait for a response, and then perform invalidation
		if (cacheStrat.type === 'invalidate') {
			return Promise.all([
				query(),
				cache.onMutate({ tables: cacheStrat.tables }),
			]).then((res) => res[0]).catch((e) => {
				throw new DrizzleQueryError(queryString, params, e as Error);
			});
		}

		if (cacheStrat.type === 'try') {
			const { tables, key, isTag, autoInvalidate, config } = cacheStrat;
			const fromCache = await cache.get(
				key,
				tables,
				isTag,
				autoInvalidate,
			);

			if (fromCache === undefined) {
				const result = await query().catch((e) => {
					throw new DrizzleQueryError(queryString, params, e as Error);
				});
				// put actual key
				await cache.put(
					key,
					result,
					// make sure we send tables that were used in a query only if user wants to invalidate it on each write
					autoInvalidate ? tables : [],
					isTag,
					config,
				);
				// put flag if we should invalidate or not
				return result;
			}

			return fromCache as unknown as TResult;
		}

		assertUnreachable(cacheStrat);
	}
}

export interface DSQLSessionOptions {
	logger?: Logger;
	cache?: Cache;
	/** Configuration for retry behavior on optimistic concurrency conflicts */
	retryConfig?: DSQLRetryConfig;
}

export class DSQLDriverSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends DSQLSession {
	static override readonly [entityKind]: string = 'DSQLDriverSession';

	private logger: Logger;
	private cache: Cache;
	private retryConfig: DSQLRetryConfig;

	constructor(
		private client: DSQLClient,
		dialect: DSQLDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: DSQLSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
		this.retryConfig = options.retryConfig ?? {};
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
	): DSQLBasePreparedQuery {
		return new DSQLPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			name,
			isResponseInArrayMode,
			this.retryConfig,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper?: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): DSQLBasePreparedQuery {
		return new DSQLPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			name,
			false,
			this.retryConfig,
			customResultMapper,
			true,
		);
	}

	override execute<T>(query: Query): Promise<T> {
		return withRetry(() => this.client.query(query.sql, query.params), this.retryConfig) as Promise<T>;
	}

	override all<T extends any[] = unknown[]>(query: Query): Promise<T> {
		return withRetry(() => this.client.query(query.sql, query.params), this.retryConfig).then((result) =>
			result.rows
		) as Promise<T>;
	}

	/**
	 * Executes a transaction with automatic retry on DSQL optimistic concurrency conflicts.
	 *
	 * **Important:** DSQL uses optimistic concurrency control (OCC), which means transactions
	 * may be automatically retried if a conflict is detected. The entire transaction callback
	 * will be re-executed on retry.
	 *
	 * **Side Effects Warning:** If your transaction contains side effects (e.g., sending emails,
	 * making external API calls, logging to external services), these side effects may be
	 * executed multiple times if the transaction is retried. To avoid this:
	 *
	 * 1. Move side effects outside the transaction callback
	 * 2. Make side effects idempotent
	 * 3. Disable retries by setting `retryConfig: { maxRetries: 0 }` in the drizzle config
	 *
	 * @example
	 * ```ts
	 * // Safe: no side effects in transaction
	 * const user = await db.transaction(async (tx) => {
	 *   const [user] = await tx.insert(users).values({ name: 'Alice' }).returning();
	 *   await tx.insert(profiles).values({ userId: user.id });
	 *   return user;
	 * });
	 * // Side effect happens after transaction commits successfully
	 * await sendWelcomeEmail(user.email);
	 *
	 * // Disable retries for transactions with unavoidable side effects
	 * const db = drizzle(client, { retryConfig: { maxRetries: 0 } });
	 * ```
	 *
	 * @param transaction - The transaction callback function
	 * @param config - Optional transaction configuration
	 * @param config.accessMode - Transaction access mode ('read only' or 'read write')
	 */
	async transaction<T>(
		transaction: (tx: DSQLTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: { accessMode?: 'read only' | 'read write' },
	): Promise<T> {
		// Check if client is a pool by looking for connect method
		const isPool = this.client && typeof this.client.connect === 'function';

		// For pools, get a dedicated client for the transaction
		const dedicatedClient = isPool ? await this.client.connect!() : null;
		const transactionClient: DSQLClient = dedicatedClient || this.client;

		// Create a session with the dedicated client for the transaction
		const session = dedicatedClient
			? new DSQLDriverSession(
				transactionClient,
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			)
			: this;

		// Wrap entire transaction in retry logic for OCC errors
		return withRetry(async () => {
			const tx = new DSQLTransaction(
				this.dialect,
				session,
				this.relations,
				this.schema,
			);

			// Use START TRANSACTION with access mode (DSQL doesn't support SET TRANSACTION)
			const startSql = config?.accessMode
				? `START TRANSACTION ${config.accessMode.toUpperCase()}`
				: 'BEGIN';
			await session.execute({ sql: startSql, params: [] });

			try {
				const result = await transaction(tx);
				await session.execute({ sql: 'COMMIT', params: [] });
				return result;
			} catch (error) {
				await session.execute({ sql: 'ROLLBACK', params: [] });
				if (is(error, TransactionRollbackError)) {
					// Transaction was intentionally rolled back - don't retry
					throw error;
				}
				throw error;
			}
		}, this.retryConfig).finally(() => {
			// Release the dedicated client back to the pool
			if (dedicatedClient && typeof dedicatedClient.release === 'function') {
				dedicatedClient.release();
			}
		});
	}
}

export class DSQLTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> {
	static readonly [entityKind]: string = 'DSQLTransaction';

	constructor(
		protected dialect: DSQLDialect,
		protected session: DSQLDriverSession<TFullSchema, TRelations, TSchema>,
		protected relations: TRelations,
		protected schema: V1.RelationalSchemaConfig<TSchema> | undefined,
	) {}

	select(): DSQLSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): DSQLSelectBuilder<TSelection>;
	select(fields?: SelectedFields): DSQLSelectBuilder<SelectedFields | undefined> {
		return new DSQLSelectBuilder({
			fields: fields as SelectedFields,
			session: this.session,
			dialect: this.dialect,
		});
	}

	insert<TTable extends DSQLTable>(table: TTable): DSQLInsertBuilder<TTable> {
		return new DSQLInsertBuilder(table, this.session, this.dialect);
	}

	update<TTable extends DSQLTable>(table: TTable): DSQLUpdateBuilder<TTable> {
		return new DSQLUpdateBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends DSQLTable>(table: TTable): DSQLDeleteBase<TTable, any, undefined> {
		return new DSQLDeleteBase(table, this.session, this.dialect);
	}

	execute<T extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper,
	): Promise<T> {
		const querySQL = query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(querySQL);
		return this.session.execute(builtQuery);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}
}

export interface DSQLQueryResultHKTImpl extends DSQLQueryResultHKT {
	type: Assume<this['row'], Record<string, unknown>>[];
}
