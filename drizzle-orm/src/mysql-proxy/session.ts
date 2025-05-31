import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import { MySqlTransaction } from '~/mysql-core/index.ts';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types.ts';
import type {
	MySqlPreparedQueryConfig,
	MySqlPreparedQueryHKT,
	MySqlQueryResultHKT,
	MySqlTransactionConfig,
	PreparedQueryKind,
} from '~/mysql-core/session.ts';
import { MySqlPreparedQuery as PreparedQueryBase, MySqlSession } from '~/mysql-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';
import type { RemoteCallback } from './driver.ts';

export type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];

export interface MySqlRemoteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class MySqlRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlSession<MySqlRemoteQueryResultHKT, MySqlRemotePreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'MySqlRemoteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: RemoteCallback,
		dialect: MySqlDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: MySqlRemoteSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PreparedQueryKind<MySqlRemotePreparedQueryHKT, T> {
		return new PreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			customResultMapper,
			generatedIds,
			returningIds,
		) as PreparedQueryKind<MySqlRemotePreparedQueryHKT, T>;
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.client(querySql.sql, querySql.params, 'all').then(({ rows }) => rows) as Promise<T[]>;
	}

	override async transaction<T>(
		_transaction: (tx: MySqlProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
		_config?: MySqlTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the MySql Proxy driver');
	}
}

export class MySqlProxyTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlTransaction<MySqlRemoteQueryResultHKT, MySqlRemotePreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'MySqlProxyTransaction';

	override async transaction<T>(
		_transaction: (tx: MySqlProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new Error('Transactions are not supported by the MySql Proxy driver');
	}
}

export class PreparedQuery<T extends MySqlPreparedQueryConfig> extends PreparedQueryBase<T> {
	static override readonly [entityKind]: string = 'MySqlProxyPreparedQuery';

	constructor(
		private client: RemoteCallback,
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
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
		// Keys that were used in $default and the value that was generated for them
		private generatedIds?: Record<string, unknown>[],
		// Keys that should be returned, it has the column with all properries + key from object
		private returningIds?: SelectedFieldsOrdered,
	) {
		super(cache, queryMetadata, cacheConfig);
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		const { fields, client, queryString, logger, joinsNotNullableMap, customResultMapper, returningIds, generatedIds } =
			this;

		logger.logQuery(queryString, params);

		if (!fields && !customResultMapper) {
			const { rows: data } = await this.queryWithCache(queryString, params, async () => {
				return await client(queryString, params, 'execute');
			});

			const insertId = data[0].insertId as number;
			const affectedRows = data[0].affectedRows;

			if (returningIds) {
				const returningResponse = [];
				let j = 0;
				for (let i = insertId; i < insertId + affectedRows; i++) {
					for (const column of returningIds) {
						const key = returningIds[0]!.path[0]!;
						if (is(column.field, Column)) {
							// @ts-ignore
							if (column.field.primary && column.field.autoIncrement) {
								returningResponse.push({ [key]: i });
							}
							if (column.field.defaultFn && generatedIds) {
								// generatedIds[rowIdx][key]
								returningResponse.push({ [key]: generatedIds[j]![key] });
							}
						}
					}
					j++;
				}

				return returningResponse;
			}

			return data;
		}

		const { rows } = await this.queryWithCache(queryString, params, async () => {
			return await client(queryString, params, 'all');
		});

		if (customResultMapper) {
			return customResultMapper(rows);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	override iterator(
		_placeholderValues: Record<string, unknown> = {},
	): AsyncGenerator<T['iterator']> {
		throw new Error('Streaming is not supported by the MySql Proxy driver');
	}
}

export interface MySqlRemoteQueryResultHKT extends MySqlQueryResultHKT {
	type: MySqlRawQueryResult;
}

export interface MySqlRemotePreparedQueryHKT extends MySqlPreparedQueryHKT {
	type: PreparedQuery<Assume<this['config'], MySqlPreparedQueryConfig>>;
}
