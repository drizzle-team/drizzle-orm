import type { Connection, ExecuteOptions, FullResult, Tx } from '@tidbcloud/serverless';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { Column } from '~/column.ts';

import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types.ts';
import {
	MySqlPreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlPreparedQueryHKT,
	type MySqlQueryResultHKT,
	MySqlSession,
	MySqlTransaction,
} from '~/mysql-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

const executeRawConfig = { fullResult: true } satisfies ExecuteOptions;
const queryConfig = { arrayMode: true } satisfies ExecuteOptions;

export class TiDBServerlessPreparedQuery<T extends MySqlPreparedQueryConfig> extends MySqlPreparedQuery<T> {
	static override readonly [entityKind]: string = 'TiDBPreparedQuery';

	constructor(
		private client: Tx | Connection,
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

		this.logger.logQuery(this.queryString, params);

		const { fields, client, queryString, joinsNotNullableMap, customResultMapper, returningIds, generatedIds } = this;
		if (!fields && !customResultMapper) {
			const res = await this.queryWithCache(queryString, params, async () => {
				return await client.execute(queryString, params, executeRawConfig) as FullResult;
			});
			const insertId = res.lastInsertId ?? 0;
			const affectedRows = res.rowsAffected ?? 0;
			// for each row, I need to check keys from
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
			return res;
		}

		const rows = await this.queryWithCache(queryString, params, async () => {
			return await client.execute(queryString, params, queryConfig) as unknown[][];
		});

		if (customResultMapper) {
			return customResultMapper(rows);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	override iterator(_placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']> {
		throw new Error('Streaming is not supported by the TiDB Cloud Serverless driver');
	}
}

export interface TiDBServerlessSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class TiDBServerlessSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlSession<TiDBServerlessQueryResultHKT, TiDBServerlessPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'TiDBServerlessSession';

	private logger: Logger;
	private client: Tx | Connection;
	private cache: Cache;

	constructor(
		private baseClient: Connection,
		dialect: MySqlDialect,
		tx: Tx | undefined,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: TiDBServerlessSessionOptions = {},
	) {
		super(dialect);
		this.client = tx ?? baseClient;
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends MySqlPreparedQueryConfig = MySqlPreparedQueryConfig>(
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
	): MySqlPreparedQuery<T> {
		return new TiDBServerlessPreparedQuery(
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
		);
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.client.execute(querySql.sql, querySql.params) as Promise<T[]>;
	}

	override async count(sql: SQL): Promise<number> {
		const res = await this.execute<{ rows: [{ count: string }] }>(sql);

		return Number(
			res['rows'][0]['count'],
		);
	}

	override async transaction<T>(
		transaction: (tx: TiDBServerlessTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const nativeTx = await this.baseClient.begin();
		try {
			const session = new TiDBServerlessSession(this.baseClient, this.dialect, nativeTx, this.schema, this.options);
			const tx = new TiDBServerlessTransaction<TFullSchema, TSchema>(
				this.dialect,
				session as MySqlSession<any, any, any, any>,
				this.schema,
			);
			const result = await transaction(tx);
			await nativeTx.commit();
			return result;
		} catch (err) {
			await nativeTx.rollback();
			throw err;
		}
	}
}

export class TiDBServerlessTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlTransaction<TiDBServerlessQueryResultHKT, TiDBServerlessPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'TiDBServerlessTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlSession,
		schema: RelationalSchemaConfig<TSchema> | undefined,
		nestedIndex = 0,
	) {
		super(dialect, session, schema, nestedIndex, 'default');
	}

	override async transaction<T>(
		transaction: (tx: TiDBServerlessTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new TiDBServerlessTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export interface TiDBServerlessQueryResultHKT extends MySqlQueryResultHKT {
	type: FullResult;
}

export interface TiDBServerlessPreparedQueryHKT extends MySqlPreparedQueryHKT {
	type: TiDBServerlessPreparedQuery<Assume<this['config'], MySqlPreparedQueryConfig>>;
}
