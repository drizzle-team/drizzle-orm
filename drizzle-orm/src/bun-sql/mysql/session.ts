/// <reference types="bun-types" />

import type { SavepointSQL, SQL as BunSQL, TransactionSQL } from 'bun';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types.ts';
import {
	type Mode,
	MySqlPreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlPreparedQueryHKT,
	type MySqlQueryResultHKT,
	MySqlSession,
	MySqlTransaction,
	type MySqlTransactionConfig,
	type PreparedQueryKind,
} from '~/mysql-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export class BunMySqlPreparedQuery<T extends MySqlPreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends MySqlPreparedQuery<T>
{
	static override readonly [entityKind]: string = 'BunMySqlPreparedQuery';

	constructor(
		private client: BunSQL,
		private query: string,
		private params: unknown[],
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		// Keys that were used in $default and the value that was generated for them
		private generatedIds?: Record<string, unknown>[],
		// Keys that should be returned, it has the column with all properries + key from object
		private returningIds?: SelectedFieldsOrdered,
		private isRqbV2Query?: TIsRqbV2,
	) {
		super(cache, queryMetadata, cacheConfig);
	}

	async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		const {
			fields,
			client,
			logger,
			params: rawParams,
			query,
			joinsNotNullableMap,
			customResultMapper,
			returningIds,
			generatedIds,
		} = this;
		const params = fillPlaceholders(rawParams, placeholderValues);

		logger.logQuery(query, params);

		if (!fields && !customResultMapper) {
			const res = await this.queryWithCache(query, params, async () => {
				return await client.unsafe(query, params);
			});

			const insertId = res.lastInsertRowid;
			const affectedRows = res.affectedRows;
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

		const rows = await this.queryWithCache(query, params, async () => {
			return await client.unsafe(query, params).values();
		});

		if (customResultMapper) {
			return customResultMapper(rows);
		}

		return rows.map((row: unknown[]) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.query, params);

		const { client, query, customResultMapper } = this;
		const rows = await client.unsafe(query, params);

		return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(rows);
	}

	async *iterator(
		placeholderValues: Record<string, unknown> = {},
	): AsyncGenerator<T['execute'] extends any[] ? T['execute'][number] : T['execute']> {
		const { fields, params: queryParams, query, joinsNotNullableMap, client, customResultMapper } = this;
		const params = fillPlaceholders(queryParams, placeholderValues);
		const rows = await this.queryWithCache(query, params, async () => {
			return await client.unsafe(query, params).values();
		});
		const hasRowsMapper = Boolean(fields || customResultMapper);

		for (const row of rows) {
			if (row === undefined || (Array.isArray(row) && row.length === 0)) {
				break;
			}

			if (hasRowsMapper) {
				if (customResultMapper) {
					const mappedRow = (customResultMapper as (rows: unknown[][]) => T['execute'])([row as unknown[]]);
					yield (Array.isArray(mappedRow) ? mappedRow[0] : mappedRow);
				} else {
					yield mapResultRow(fields!, row as unknown[], joinsNotNullableMap);
				}
			} else {
				yield row as T['execute'];
			}
		}
	}
}

export interface BunMySqlSessionOptions {
	logger?: Logger;
	cache?: Cache;
	mode: Mode;
}

export class BunMySqlSession<
	TSQL extends BunSQL,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends MySqlSession<MySqlQueryResultHKT, BunMySqlPreparedQueryHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'BunMySqlSession';

	private logger: Logger;
	private mode: Mode;
	private cache: Cache;

	constructor(
		readonly client: TSQL,
		dialect: MySqlDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		readonly options: BunMySqlSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
		this.mode = options.mode;
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
	): PreparedQueryKind<BunMySqlPreparedQueryHKT, T> {
		// Add returningId fields
		// Each driver gets them from response from database
		return new BunMySqlPreparedQuery(
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
		) as PreparedQueryKind<BunMySqlPreparedQueryHKT, T>;
	}

	prepareRelationalQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
	): PreparedQueryKind<BunMySqlPreparedQueryHKT, T> {
		// Add returningId fields
		// Each driver gets them from response from database
		return new BunMySqlPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			customResultMapper,
			generatedIds,
			returningIds,
			true,
		) as any;
	}

	/** @internal */
	async query(query: string, params: unknown[]): Promise<Record<string, unknown>[]> {
		this.logger.logQuery(query, params);
		const result = await this.client.unsafe(query, params);
		return result;
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.client.unsafe(querySql.sql, querySql.params);
	}

	override async count(sql: SQL): Promise<number> {
		const query = this.dialect.sqlToQuery(sql);
		const data = await this.client.unsafe(query.sql, query.params).values();

		const count = data[0][0];
		if (typeof count === 'number') return count;
		return Number(count);
	}

	override async transaction<T>(
		transaction: (tx: BunMySqlTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T> {
		const startTransactionSql = config
			? this.getStartTransactionSQL(config)?.inlineParams().toQuery(this.dialect).sql.slice(18) ?? ''
			: '';

		if (config?.isolationLevel) throw new Error("Driver doesn't support setting isolation level on transaction");

		return this.client.begin(startTransactionSql, async (client) => {
			const session = new BunMySqlSession<TransactionSQL, TFullSchema, TRelations, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			);
			const tx = new BunMySqlTransaction<TFullSchema, TRelations, TSchema>(
				this.dialect,
				session as MySqlSession<any, any, any, any, any>,
				this.relations,
				this.schema,
				0,
				this.mode,
			);
			// if (config) {
			// 	const setTransactionConfigSql = this.getSetTransactionSQL(config);
			// 	if (setTransactionConfigSql) {
			// 		await tx.execute(setTransactionConfigSql);
			// 	}
			// }
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class BunMySqlTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends MySqlTransaction<
	BunMySqlQueryResultHKT,
	BunMySqlPreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'BunMySqlTransaction';

	override async transaction<T>(
		transaction: (tx: BunMySqlTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		return (<BunMySqlSession<TransactionSQL, any, any, any>> this.session).client.savepoint((client) => {
			const session = new BunMySqlSession<SavepointSQL, TFullSchema, TRelations, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				(<BunMySqlSession<any, any, any, any>> this.session).options,
			);
			const tx = new BunMySqlTransaction<TFullSchema, TRelations, TSchema>(
				this.dialect,
				session as MySqlSession<any, any, any, any, any>,
				this.relations,
				this.schema,
				this.nestedIndex + 1,
				this.mode,
			);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface BunMySqlQueryResultHKT extends MySqlQueryResultHKT {
	type: Record<string, unknown>[] & Record<string, unknown>;
}

export interface BunMySqlPreparedQueryHKT extends MySqlPreparedQueryHKT {
	type: BunMySqlPreparedQuery<Assume<this['config'], MySqlPreparedQueryConfig>>;
}
