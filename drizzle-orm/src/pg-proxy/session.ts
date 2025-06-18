import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery as PreparedQueryBase, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { QueryWithTypings } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';
import type { RemoteCallback } from './driver.ts';

export interface PgRemoteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PgRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<PgRemoteQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'PgRemoteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: RemoteCallback,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: PgRemoteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: QueryWithTypings,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PreparedQuery<T> {
		return new PreparedQuery(
			this.client,
			query.sql,
			query.params,
			query.typings,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override async transaction<T>(
		_transaction: (tx: PgProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the Postgres Proxy driver');
	}
}

export class PgProxyTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<PgRemoteQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'PgProxyTransaction';

	override async transaction<T>(
		_transaction: (tx: PgProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new Error('Transactions are not supported by the Postgres Proxy driver');
	}
}

export class PreparedQuery<T extends PreparedQueryConfig> extends PreparedQueryBase<T> {
	static override readonly [entityKind]: string = 'PgProxyPreparedQuery';

	constructor(
		private client: RemoteCallback,
		private queryString: string,
		private params: unknown[],
		private typings: any[] | undefined,
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.params, placeholderValues);
			const { fields, client, queryString, joinsNotNullableMap, customResultMapper, logger, typings } = this;

			span?.setAttributes({
				'drizzle.query.text': queryString,
				'drizzle.query.params': JSON.stringify(params),
			});

			logger.logQuery(queryString, params);

			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', async () => {
					const { rows } = await this.queryWithCache(queryString, params, async () => {
						return await client(queryString, params as any[], 'execute', typings);
					});

					return rows;
				});
			}

			const rows = await tracer.startActiveSpan('drizzle.driver.execute', async () => {
				span?.setAttributes({
					'drizzle.query.text': queryString,
					'drizzle.query.params': JSON.stringify(params),
				});

				const { rows } = await this.queryWithCache(queryString, params, async () => {
					return await client(queryString, params as any[], 'all', typings);
				});

				return rows;
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return customResultMapper
					? customResultMapper(rows)
					: rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	async all() {
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface PgRemoteQueryResultHKT extends PgQueryResultHKT {
	type: Assume<this['row'], {
		[column: string]: any;
	}>[];
}
