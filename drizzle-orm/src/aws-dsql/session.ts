import type { Client, PoolClient, QueryArrayConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery } from '~/pg-core/async/session.ts';
import { PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig } from '~/pg-core/session.ts';
import type { PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

const { types } = pg;
export type AwsDsqlClient = pg.Pool | PoolClient | Client;

const DSQL_RETRYABLE_ERRORS = ['OC000', 'OC001', '40001'];
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 50;
const DEFAULT_MAX_DELAY_MS = 5000;

/**
 * Error thrown when DSQL retry attempts are exhausted due to optimistic concurrency conflicts.
 *
 * This error indicates that the operation failed after multiple retry attempts due to
 * concurrent modifications to the same data. Consider:
 * - Increasing maxRetries in retryConfig
 * - Reducing contention by batching operations differently
 * - Using read-only transactions where possible
 */
export class AwsDsqlRetryExhaustedError extends DrizzleError {
	static override readonly [entityKind]: string = 'AwsDsqlRetryExhaustedError';

	constructor(
		public readonly attempts: number,
		cause: unknown,
	) {
		super({
			message: `DSQL operation failed after ${attempts} retry attempts due to optimistic concurrency conflicts. `
				+ `This typically occurs when multiple transactions are modifying the same data. `
				+ `Consider increasing maxRetries in retryConfig or reducing contention.`,
			cause,
		});
	}
}

/**
 * Configuration for DSQL retry behavior on optimistic concurrency conflicts.
 */
export interface AwsDsqlRetryConfig {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Base delay in milliseconds for exponential backoff (default: 50) */
	baseDelayMs?: number;
	/** Maximum delay in milliseconds between retries (default: 5000) */
	maxDelayMs?: number;
	/** Optional callback invoked before each retry attempt for structured logging */
	onRetry?: (error: unknown, attempt: number, maxAttempts: number) => void;
}

const defaultRetryConfig: Required<Omit<AwsDsqlRetryConfig, 'onRetry'>> = {
	maxRetries: DEFAULT_MAX_RETRIES,
	baseDelayMs: DEFAULT_BASE_DELAY_MS,
	maxDelayMs: DEFAULT_MAX_DELAY_MS,
};

/**
 * Validates retry configuration to prevent invalid/pathological configs.
 * @throws {DrizzleError} if config is invalid
 */
function validateRetryConfig(config: AwsDsqlRetryConfig): void {
	if (config.maxRetries !== undefined && config.maxRetries < 0) {
		throw new DrizzleError({
			message: `Invalid retryConfig: maxRetries must be >= 0, got ${config.maxRetries}`,
		});
	}
	if (config.baseDelayMs !== undefined && config.baseDelayMs <= 0) {
		throw new DrizzleError({
			message: `Invalid retryConfig: baseDelayMs must be > 0, got ${config.baseDelayMs}`,
		});
	}
	if (config.maxDelayMs !== undefined && config.maxDelayMs <= 0) {
		throw new DrizzleError({
			message: `Invalid retryConfig: maxDelayMs must be > 0, got ${config.maxDelayMs}`,
		});
	}
	if (
		config.baseDelayMs !== undefined && config.maxDelayMs !== undefined
		&& config.maxDelayMs < config.baseDelayMs
	) {
		throw new DrizzleError({
			message: `Invalid retryConfig: maxDelayMs (${config.maxDelayMs}) must be >= baseDelayMs (${config.baseDelayMs})`,
		});
	}
}

// PostgreSQL array type OIDs that need pass-through parsing
const PG_ARRAY_TYPE_OIDS = {
	NUMERIC_ARRAY: 1231,
	TIMESTAMP_ARRAY: 1115,
	TIMESTAMPTZ_ARRAY: 1185,
	INTERVAL_ARRAY: 1187,
	DATE_ARRAY: 1182,
};

/**
 * Creates a type parser configuration for pg that preserves raw values for
 * timestamp, date, interval types (both scalar and array forms).
 */
function createDsqlTypeParser() {
	return {
		// @ts-ignore - pg types API
		getTypeParser: (typeId: number, format?: string) => {
			// Pass through temporal types as raw strings
			if (
				typeId === types.builtins.TIMESTAMPTZ
				|| typeId === types.builtins.TIMESTAMP
				|| typeId === types.builtins.DATE
				|| typeId === types.builtins.INTERVAL
			) {
				return (val: any) => val;
			}
			// Pass through array types
			if (
				typeId === PG_ARRAY_TYPE_OIDS.NUMERIC_ARRAY
				|| typeId === PG_ARRAY_TYPE_OIDS.TIMESTAMP_ARRAY
				|| typeId === PG_ARRAY_TYPE_OIDS.TIMESTAMPTZ_ARRAY
				|| typeId === PG_ARRAY_TYPE_OIDS.INTERVAL_ARRAY
				|| typeId === PG_ARRAY_TYPE_OIDS.DATE_ARRAY
			) {
				return (val: any) => val;
			}
			// @ts-ignore - pg types API
			return types.getTypeParser(typeId, format);
		},
	};
}

function isDsqlRetryableError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const err = error as { code?: string; message?: string; cause?: unknown };
	// Check PostgreSQL error code
	if (err.code && DSQL_RETRYABLE_ERRORS.includes(err.code)) return true;
	// Check error message for DSQL error codes
	if (err.message) {
		if (DSQL_RETRYABLE_ERRORS.some((code) => err.message!.includes(`(${code})`))) {
			return true;
		}
	}
	// Check the cause (errors may be wrapped by Drizzle's error handler)
	if (err.cause) {
		return isDsqlRetryableError(err.cause);
	}
	return false;
}

async function withRetry<T>(
	fn: () => Promise<T>,
	config: AwsDsqlRetryConfig = {},
): Promise<T> {
	const { maxRetries, baseDelayMs, maxDelayMs, onRetry } = { ...defaultRetryConfig, ...config };
	let lastError: unknown;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isDsqlRetryableError(error)) {
				throw error;
			}
			if (attempt === maxRetries) {
				throw new AwsDsqlRetryExhaustedError(attempt + 1, error);
			}
			// Notify via callback or default console warning
			if (onRetry) {
				onRetry(error, attempt + 1, maxRetries + 1);
			} else {
				const errCode = (error as { code?: string }).code ?? 'unknown';
				console.warn(
					`[drizzle:dsql] OCC conflict detected (${errCode}). Retrying (attempt ${attempt + 2}/${maxRetries + 1})...`,
				);
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

export class AwsDsqlPreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PgAsyncPreparedQuery<T>
{
	static override readonly [entityKind]: string = 'AwsDsqlPreparedQuery';

	private rawQueryConfig: QueryConfig;
	private queryConfig: QueryArrayConfig;

	constructor(
		private client: AwsDsqlClient,
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
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
		const typeParser = createDsqlTypeParser();
		this.rawQueryConfig = {
			name,
			text: queryString,
			types: typeParser,
		};
		this.queryConfig = {
			name,
			text: queryString,
			rowMode: 'array',
			types: typeParser,
		};
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		return tracer.startActiveSpan('drizzle.execute', async () => {
			const params = fillPlaceholders(this.params, placeholderValues);

			this.logger.logQuery(this.rawQueryConfig.text, params);

			const { fields, rawQueryConfig: rawQuery, client, queryConfig: query, joinsNotNullableMap, customResultMapper } =
				this;
			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
					span?.setAttributes({
						'drizzle.query.name': rawQuery.name,
						'drizzle.query.text': rawQuery.text,
						'drizzle.query.params': JSON.stringify(params),
					});
					return this.queryWithCache(rawQuery.text, params, async () => {
						return await client.query(rawQuery, params);
					});
				});
			}

			const result = await tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.name': query.name,
					'drizzle.query.text': query.text,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.queryWithCache(query.text, params, async () => {
					return await client.query(query, params);
				});
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return customResultMapper
					? (customResultMapper as (rows: unknown[][]) => T['execute'])(result.rows)
					: result.rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async () => {
			const params = fillPlaceholders(this.params, placeholderValues);

			this.logger.logQuery(this.rawQueryConfig.text, params);

			const { rawQueryConfig: rawQuery, client, customResultMapper } = this;

			const result = await tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.name': rawQuery.name,
					'drizzle.query.text': rawQuery.text,
					'drizzle.query.params': JSON.stringify(params),
				});
				return client.query(rawQuery, params);
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(result.rows);
			});
		});
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		return tracer.startActiveSpan('drizzle.execute', () => {
			const params = fillPlaceholders(this.params, placeholderValues);
			this.logger.logQuery(this.rawQueryConfig.text, params);
			return tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.name': this.rawQueryConfig.name,
					'drizzle.query.text': this.rawQueryConfig.text,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.queryWithCache(this.rawQueryConfig.text, params, async () => {
					return this.client.query(this.rawQueryConfig, params);
				}).then((result) => result.rows);
			});
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface AwsDsqlSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class AwsDsqlSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<AwsDsqlQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'AwsDsqlSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: AwsDsqlClient,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: AwsDsqlSessionOptions = {},
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
	) {
		return new AwsDsqlPreparedQuery(
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
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper?: (rows: Record<string, unknown>[]) => T['execute'],
	) {
		return new AwsDsqlPreparedQuery(
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
			customResultMapper,
			true,
		);
	}

	/**
	 * Execute a transaction.
	 */
	override async transaction<T>(
		transaction: (tx: AwsDsqlTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		return this.executeTransaction(transaction, config);
	}

	/**
	 * Executes a transaction with automatic retry on DSQL optimistic concurrency conflicts.
	 *
	 * **Important:** The entire transaction callback will be re-executed on retry.
	 * Only use this for idempotent transactions without side effects.
	 *
	 * @param transaction The transaction callback
	 * @param config Optional transaction config (isolation level, access mode)
	 * @param retryConfig Optional retry configuration (defaults: maxRetries=3, baseDelayMs=50, maxDelayMs=5000)
	 */
	async transactionWithRetry<T>(
		transaction: (tx: AwsDsqlTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
		retryConfig?: AwsDsqlRetryConfig,
	): Promise<T> {
		const resolvedRetryConfig = retryConfig ?? {};
		validateRetryConfig(resolvedRetryConfig);

		return withRetry(
			() => this.executeTransaction(transaction, config),
			resolvedRetryConfig,
		);
	}

	private async executeTransaction<T>(
		transaction: (tx: AwsDsqlTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		// Duck typing: pools have totalCount property that single clients don't have
		const isPool = 'totalCount' in this.client;

		// For pools, get a dedicated client for the transaction
		const dedicatedClient = isPool ? await (<pg.Pool> this.client).connect() : null;
		const transactionClient: AwsDsqlClient = dedicatedClient || this.client;

		// Create a session with the dedicated client for the transaction
		const session = dedicatedClient
			? new AwsDsqlSession(
				transactionClient,
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			)
			: this;

		const tx = new AwsDsqlTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			session,
			this.relations,
			this.schema,
		);

		try {
			// Use BEGIN with config (standard PostgreSQL syntax)
			await tx.execute(config ? sql`BEGIN ${tx.getTransactionConfigSQL(config)}` : sql`BEGIN`);

			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			try {
				await tx.execute(sql`ROLLBACK`);
			} catch (rollbackError) {
				console.error('[drizzle:dsql] CRITICAL: Rollback failed after transaction error.', {
					originalError: error,
					rollbackError,
				});
				// Enrich the original error with rollback failure info for debugging
				if (error && typeof error === 'object') {
					(error as Record<string, unknown>).rollbackError = rollbackError;
				}
			}
			throw error;
		} finally {
			if (dedicatedClient) {
				try {
					(dedicatedClient as PoolClient).release();
				} catch (releaseError) {
					console.error('[drizzle:dsql] Warning: Failed to release pool client.', releaseError);
				}
			}
		}
	}
}

export class AwsDsqlTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncTransaction<AwsDsqlQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'AwsDsqlTransaction';

	override async transaction<T>(
		_transaction: (tx: AwsDsqlTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new DrizzleError({
			message: 'DSQL does not support nested transactions (savepoints). '
				+ 'Please restructure your code to avoid nested db.transaction() calls.',
		});
	}
}

export interface AwsDsqlQueryResultHKT extends PgQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}

// Export internal functions for testing
export { isDsqlRetryableError, validateRetryConfig, withRetry };
