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
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { GoogleSqlDialect } from '~/googlesql/dialect.ts';
import type { SelectedFieldsOrdered } from '~/googlesql/query-builders/select.types.ts';
import {
	type Mode,
	GoogleSqlPreparedQuery,
	type GoogleSqlPreparedQueryConfig,
	type GoogleSqlPreparedQueryHKT,
	type GoogleSqlQueryResultHKT,
	GoogleSqlSession,
	GoogleSqlTransaction,
	type GoogleSqlTransactionConfig,
	type PreparedQueryKind,
} from '~/googlesql/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, sql } from '~/sql/sql.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export type SpannerClient = Pool | Connection;

export type GoogleSqlRawQueryResult = [ResultSetHeader, FieldPacket[]];
export type GoogleSqlQueryResultType = RowDataPacket[][] | RowDataPacket[] | OkPacket | OkPacket[] | ResultSetHeader;
export type GoogleSqlQueryResult<
	T = any,
> = [T extends ResultSetHeader ? T : T[], FieldPacket[]];

export class SpannerPreparedQuery<T extends GoogleSqlPreparedQueryConfig> extends GoogleSqlPreparedQuery<T> {
	static override readonly [entityKind]: string = 'SpannerPreparedQuery';

	private rawQuery: QueryOptions;
	private query: QueryOptions;

	constructor(
		private client: SpannerClient,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
		// Keys that were used in $default and the value that was generated for them
		private generatedIds?: Record<string, unknown>[],
		// Keys that should be returned, it has the column with all properries + key from object
		private returningIds?: SelectedFieldsOrdered,
	) {
		super();
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
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.rawQuery.sql, params);

		const { fields, client, rawQuery, query, joinsNotNullableMap, customResultMapper, returningIds, generatedIds } =
			this;
		if (!fields && !customResultMapper) {
			const res = await client.query<any>(rawQuery, params);
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

		const result = await client.query<any[]>(query, params);
		const rows = result[0];

		if (customResultMapper) {
			return customResultMapper(rows);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
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
				} else if (row instanceof Error) { // eslint-disable-line no-instanceof/no-instanceof
					throw row;
				} else {
					if (hasRowsMapper) {
						if (customResultMapper) {
							const mappedRow = customResultMapper([row as unknown[]]);
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

export interface SpannerSessionOptions {
	logger?: Logger;
	mode: Mode;
}

export class SpannerSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends GoogleSqlSession<GoogleSqlQueryResultHKT, SpannerPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'SpannerSession';

	private logger: Logger;
	private mode: Mode;

	constructor(
		private client: SpannerClient,
		dialect: GoogleSqlDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: SpannerSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.mode = options.mode;
	}

	prepareQuery<T extends GoogleSqlPreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
	): PreparedQueryKind<SpannerPreparedQueryHKT, T> {
		// Add returningId fields
		// Each driver gets them from response from database
		return new SpannerPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			customResultMapper,
			generatedIds,
			returningIds,
		) as PreparedQueryKind<SpannerPreparedQueryHKT, T>;
	}

	/**
	 * @internal
	 * What is its purpose?
	 */
	async query(query: string, params: unknown[]): Promise<GoogleSqlQueryResult> {
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
		transaction: (tx: SpannerTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: GoogleSqlTransactionConfig,
	): Promise<T> {
		const session = isPool(this.client)
			? new SpannerSession(
				await this.client.getConnection(),
				this.dialect,
				this.schema,
				this.options,
			)
			: this;
		const tx = new SpannerTransaction<TFullSchema, TSchema>(
			this.dialect,
			session as GoogleSqlSession<any, any, any, any>,
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

export class SpannerTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends GoogleSqlTransaction<SpannerQueryResultHKT, SpannerPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'SpannerTransaction';

	override async transaction<T>(transaction: (tx: SpannerTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new SpannerTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
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

function isPool(client: SpannerClient): client is Pool {
	return 'getConnection' in client;
}

export interface SpannerQueryResultHKT extends GoogleSqlQueryResultHKT {
	type: GoogleSqlRawQueryResult;
}

export interface SpannerPreparedQueryHKT extends GoogleSqlPreparedQueryHKT {
	type: SpannerPreparedQuery<Assume<this['config'], GoogleSqlPreparedQueryConfig>>;
}
