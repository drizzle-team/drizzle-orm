import type { Connection as CallbackConnection } from 'mysql2';
import type {
	Connection,
	FieldPacket,
	OkPacket,
	Pool,
	PoolConnection,
	QueryOptions,
	ResultSetHeader,
	RowDataPacket,
} from 'mysql2/promise';
import { once } from 'node:events';
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
import { fillPlaceholders, sql } from '~/sql/sql.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export type MySql2Client = Pool | Connection;

export type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];
export type MySqlQueryResultType = RowDataPacket[][] | RowDataPacket[] | OkPacket | OkPacket[] | ResultSetHeader;
export type MySqlQueryResult<
	T = any,
> = [T extends ResultSetHeader ? T : T[], FieldPacket[]];

export class MySql2PreparedQuery<T extends MySqlPreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends MySqlPreparedQuery<T>
{
	static override readonly [entityKind]: string = 'MySql2PreparedQuery';

	private rawQuery: QueryOptions;
	private query: QueryOptions;

	constructor(
		private client: MySql2Client,
		queryString: string,
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
		this.rawQuery = {
			sql: queryString,
			// rowsAsArray: true,
			typeCast: function(field: any, next: any) {
				if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
					return field.string();
				}
				return next();
			},
		};
		this.query = {
			sql: queryString,
			rowsAsArray: true,
			typeCast: function(field: any, next: any) {
				if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
					return field.string();
				}
				return next();
			},
		};
	}

	async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.rawQuery.sql, params);

		const { fields, client, rawQuery, query, joinsNotNullableMap, customResultMapper, returningIds, generatedIds } =
			this;
		if (!fields && !customResultMapper) {
			const res = await this.queryWithCache(rawQuery.sql, params, async () => {
				return await client.query<any>(rawQuery, params);
			});

			const insertId = res[0].insertId;
			const affectedRows = res[0].affectedRows;
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

		const result = await this.queryWithCache(query.sql, params, async () => {
			return await client.query<any[]>(query, params);
		});

		const rows = result[0];

		if (customResultMapper) {
			return customResultMapper(rows);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.rawQuery.sql, params);

		const { client, rawQuery, customResultMapper } = this;
		const res = await client.query<any>(rawQuery, params);

		const rows = res[0];

		return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(rows);
	}

	async *iterator(
		placeholderValues: Record<string, unknown> = {},
	): AsyncGenerator<T['execute'] extends any[] ? T['execute'][number] : T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		const conn = ((isPool(this.client) ? await this.client.getConnection() : this.client) as {} as {
			connection: CallbackConnection;
		}).connection;

		const { fields, query, rawQuery, joinsNotNullableMap, client, customResultMapper } = this;
		const hasRowsMapper = Boolean(fields || customResultMapper);
		const driverQuery = hasRowsMapper ? conn.query(query, params) : conn.query(rawQuery, params);

		const stream = driverQuery.stream();

		function dataListener() {
			stream.pause();
		}

		stream.on('data', dataListener);

		try {
			const onEnd = once(stream, 'end');
			const onError = once(stream, 'error');

			while (true) {
				stream.resume();
				const row = await Promise.race([onEnd, onError, new Promise((resolve) => stream.once('data', resolve))]);
				if (row === undefined || (Array.isArray(row) && row.length === 0)) {
					break;
				} else if (row instanceof Error) { // oxlint-disable-line drizzle-internal/no-instanceof
					throw row;
				} else {
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
		} finally {
			stream.off('data', dataListener);
			if (isPool(client)) {
				conn.end();
			}
		}
	}
}

export interface MySql2SessionOptions {
	logger?: Logger;
	cache?: Cache;
	mode: Mode;
}

export class MySql2Session<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends MySqlSession<MySqlQueryResultHKT, MySql2PreparedQueryHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'MySql2Session';

	private logger: Logger;
	private mode: Mode;
	private cache: Cache;

	constructor(
		private client: MySql2Client,
		dialect: MySqlDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: MySql2SessionOptions,
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
	): PreparedQueryKind<MySql2PreparedQueryHKT, T> {
		// Add returningId fields
		// Each driver gets them from response from database
		return new MySql2PreparedQuery(
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
		) as PreparedQueryKind<MySql2PreparedQueryHKT, T>;
	}

	prepareRelationalQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
	): PreparedQueryKind<MySql2PreparedQueryHKT, T> {
		// Add returningId fields
		// Each driver gets them from response from database
		return new MySql2PreparedQuery(
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

	/**
	 * @internal
	 * What is its purpose?
	 */
	async query(query: string, params: unknown[]): Promise<MySqlQueryResult> {
		this.logger.logQuery(query, params);
		const result = await this.client.query({
			sql: query,
			values: params,
			rowsAsArray: true,
			typeCast: function(field: any, next: any) {
				if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
					return field.string();
				}
				return next();
			},
		});
		return result;
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.client.execute(querySql.sql, querySql.params).then((result) => result[0]) as Promise<T[]>;
	}

	override async transaction<T>(
		transaction: (tx: MySql2Transaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T> {
		const session = isPool(this.client)
			? new MySql2Session(
				await this.client.getConnection(),
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			)
			: this;
		const tx = new MySql2Transaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			session as MySqlSession<any, any, any, any, any>,
			this.relations,
			this.schema,
			0,
			this.mode,
		);
		if (config) {
			const setTransactionConfigSql = this.getSetTransactionSQL(config);
			if (setTransactionConfigSql) {
				await tx.execute(setTransactionConfigSql);
			}
			const startTransactionSql = this.getStartTransactionSQL(config);
			await (startTransactionSql ? tx.execute(startTransactionSql) : tx.execute(sql`begin`));
		} else {
			await tx.execute(sql`begin`);
		}
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (err) {
			await tx.execute(sql`rollback`);
			throw err;
		} finally {
			if (isPool(this.client)) {
				(session.client as PoolConnection).release();
			}
		}
	}
}

export class MySql2Transaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends MySqlTransaction<
	MySql2QueryResultHKT,
	MySql2PreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'MySql2Transaction';

	override async transaction<T>(
		transaction: (tx: MySql2Transaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new MySql2Transaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			this.session,
			this.relations,
			this.schema,
			this.nestedIndex + 1,
			this.mode,
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

function isPool(client: MySql2Client): client is Pool {
	return 'getConnection' in client;
}

export interface MySql2QueryResultHKT extends MySqlQueryResultHKT {
	type: MySqlRawQueryResult;
}

export interface MySql2PreparedQueryHKT extends MySqlPreparedQueryHKT {
	type: MySql2PreparedQuery<Assume<this['config'], MySqlPreparedQueryConfig>>;
}
