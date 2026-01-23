import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { DSQLDialect } from '~/dsql-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/dsql-core/query-builders/select.types.ts';
import {
	DSQLBasePreparedQuery,
	type DSQLQueryResultHKT,
	DSQLSession,
	type DSQLTransactionConfig,
	type PreparedQueryConfig,
} from '~/dsql-core/session.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

// DSQL client type - could be AWS SDK client or pg-compatible client
export type DSQLClient = unknown;

// DSQL optimistic concurrency error codes
const DSQL_RETRYABLE_ERRORS = ['OC000', 'OC001', '40001'];
const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;

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
	maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!isDSQLRetryableError(error) || attempt === maxRetries) {
				throw error;
			}
			// Exponential backoff with jitter
			const delay = BASE_DELAY_MS * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
	throw lastError;
}

export class DSQLPreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends DSQLBasePreparedQuery
{
	static override readonly [entityKind]: string = 'DSQLPreparedQuery';

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
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super({ sql: queryString, params });
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);

		const { fields, customResultMapper, isRqbV2Query } = this;

		// If no fields and no custom mapper, return raw result with retry
		if (!fields && !customResultMapper) {
			return withRetry(() => (this.client as any).query(this.queryString, params));
		}

		// For RQB v2 queries, use object mode with retry
		if (isRqbV2Query) {
			const result = await withRetry(() => (this.client as any).query(this.queryString, params));
			return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(result.rows);
		}

		// Use array mode for select queries with fields, with retry
		const result = await withRetry(() =>
			(this.client as any).query({
				text: this.queryString,
				values: params,
				rowMode: 'array',
			})
		);

		return customResultMapper
			? (customResultMapper as (rows: unknown[][]) => T['execute'])(result.rows)
			: result.rows.map((row: unknown[]) => mapResultRow<T['execute']>(fields!, row, this.joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);
		return withRetry(() => (this.client as any).query(this.queryString, params)).then((result: any) => result.rows);
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}

	/** @internal */
	protected queryWithCache(
		_queryString: string,
		_params: any[],
		_query: unknown,
	): unknown {
		throw new Error('Method not implemented.');
	}
}

export interface DSQLSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class DSQLDriverSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends DSQLSession {
	static override readonly [entityKind]: string = 'DSQLDriverSession';

	private logger: Logger;
	private cache: Cache;

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
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper?: (rows: Record<string, unknown>[]) => T['execute'],
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
			customResultMapper,
			true,
		);
	}

	override execute<T>(query: Query): Promise<T> {
		return withRetry(() => (this.client as any).query(query.sql, query.params));
	}

	override all<T extends any[] = unknown[]>(query: Query): Promise<T> {
		return withRetry(() => (this.client as any).query(query.sql, query.params)).then((result: any) => result.rows);
	}

	async transaction<T>(
		_transaction: (tx: DSQLTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		_config?: DSQLTransactionConfig | undefined,
	): Promise<T> {
		throw new Error('Method not implemented.');
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
		protected nestedIndex: number = 0,
	) {}

	rollback(): never {
		throw new Error('Method not implemented.');
	}

	async transaction<T>(
		_transaction: (tx: DSQLTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new Error('Method not implemented.');
	}
}

export interface DSQLQueryResultHKTImpl extends DSQLQueryResultHKT {
	type: Assume<this['row'], Record<string, unknown>>[];
}
