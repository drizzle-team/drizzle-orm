import type { Row, RowList, Sql, TransactionSql } from 'postgres';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { BlankPgHookContext, DrizzlePgExtension } from '~/extension-core/pg/index.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export class PostgresJsPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'PostgresJsPreparedQuery';

	constructor(
		private client: Sql,
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
		private _isResponseInArrayMode: boolean,
		extensions?: DrizzlePgExtension[],
		hookContext?: BlankPgHookContext,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig, extensions, hookContext);
	}

	async _execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.params, placeholderValues);

			span?.setAttributes({
				'drizzle.query.text': this.queryString,
				'drizzle.query.params': JSON.stringify(params),
			});

			this.logger.logQuery(this.queryString, params);

			const { fields, queryString: query, client, joinsNotNullableMap, customResultMapper } = this;
			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', () => {
					return this.queryWithCache(query, params, async () => {
						return await client.unsafe(query, params as any[]);
					});
				});
			}

			const rows = await tracer.startActiveSpan('drizzle.driver.execute', () => {
				span?.setAttributes({
					'drizzle.query.text': query,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.queryWithCache(query, params, async () => {
					return await client.unsafe(query, params as any[]).values();
				});
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return customResultMapper
					? customResultMapper(rows)
					: rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.params, placeholderValues);
			span?.setAttributes({
				'drizzle.query.text': this.queryString,
				'drizzle.query.params': JSON.stringify(params),
			});
			this.logger.logQuery(this.queryString, params);
			return tracer.startActiveSpan('drizzle.driver.execute', () => {
				span?.setAttributes({
					'drizzle.query.text': this.queryString,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.queryWithCache(this.queryString, params, async () => {
					return this.client.unsafe(this.queryString, params as any[]);
				});
			});
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface PostgresJsSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PostgresJsSession<
	TSQL extends Sql,
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<PostgresJsQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'PostgresJsSession';

	logger: Logger;
	private cache: Cache;

	constructor(
		public client: TSQL,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		/** @internal */
		readonly options: PostgresJsSessionOptions = {},
		extensions?: DrizzlePgExtension[],
	) {
		super(dialect, extensions);
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
		hookContext?: BlankPgHookContext,
	): PgPreparedQuery<T> {
		return new PostgresJsPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			isResponseInArrayMode,
			this.extensions,
			hookContext,
			customResultMapper,
		);
	}

	query(query: string, params: unknown[]): Promise<RowList<Row[]>> {
		this.logger.logQuery(query, params);
		return this.client.unsafe(query, params as any[]).values();
	}

	queryObjects<T extends Row>(
		query: string,
		params: unknown[],
	): Promise<RowList<T[]>> {
		return this.client.unsafe(query, params as any[]);
	}

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		const { extensions, schema, dialect, options, client } = this;

		return client.begin(async (client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TSchema>(
				client,
				dialect,
				schema,
				options,
				extensions,
			);
			const tx = new PostgresJsTransaction(dialect, session, schema, undefined, extensions);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PostgresJsTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<PostgresJsQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'PostgresJsTransaction';

	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: PostgresJsSession<TransactionSql, TFullSchema, TSchema>,
		schema: RelationalSchemaConfig<TSchema> | undefined,
		nestedIndex = 0,
		extensions?: DrizzlePgExtension[],
	) {
		super(dialect, session, schema, nestedIndex, extensions);
	}

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		return this.session.client.savepoint((client) => {
			const session = new PostgresJsSession<TransactionSql, TFullSchema, TSchema>(
				client,
				this.dialect,
				this.schema,
				this.session.options,
				this._.extensions,
			);
			const tx = new PostgresJsTransaction<TFullSchema, TSchema>(
				this.dialect,
				session,
				this.schema,
				undefined,
				this._.extensions,
			);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface PostgresJsQueryResultHKT extends PgQueryResultHKT {
	type: RowList<Assume<this['row'], Row>[]>;
}
