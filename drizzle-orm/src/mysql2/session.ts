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
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types.ts';
import {
	type Mode,
	MySqlSession,
	MySqlTransaction,
	type MySqlTransactionConfig,
	PreparedQuery,
	type PreparedQueryConfig,
	type PreparedQueryHKT,
	type PreparedQueryKind,
	type QueryResultHKT,
} from '~/mysql-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export type MySql2Client = Pool | Connection;

export type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];
export type MySqlQueryResultType = RowDataPacket[][] | RowDataPacket[] | OkPacket | OkPacket[] | ResultSetHeader;
export type MySqlQueryResult<
	T = any,
> = [T extends ResultSetHeader ? T : T[], FieldPacket[]];

export class MySql2PreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	static readonly [entityKind]: string = 'MySql2PreparedQuery';

	private rawQuery: QueryOptions;
	private query: QueryOptions;

	constructor(
		private client: MySql2Client,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
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

		const { fields, client, rawQuery, query, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			return client.query(rawQuery, params);
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

export interface MySql2SessionOptions {
	logger?: Logger;
	mode: Mode;
}

export class MySql2Session<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlSession<MySql2QueryResultHKT, MySql2PreparedQueryHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'MySql2Session';

	private logger: Logger;
	private mode: Mode;

	constructor(
		private client: MySql2Client,
		dialect: MySqlDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: MySql2SessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.mode = options.mode;
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQueryKind<MySql2PreparedQueryHKT, T> {
		return new MySql2PreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			customResultMapper,
		) as PreparedQueryKind<MySql2PreparedQueryHKT, T>;
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
		transaction: (tx: MySql2Transaction<TFullSchema, TSchema>) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T> {
		const session = isPool(this.client)
			? new MySql2Session(await this.client.getConnection(), this.dialect, this.schema, this.options)
			: this;
		const tx = new MySql2Transaction(
			this.dialect,
			session as MySqlSession<any, any, any, any>,
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
	TSchema extends TablesRelationalConfig,
> extends MySqlTransaction<MySql2QueryResultHKT, MySql2PreparedQueryHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'MySql2Transaction';

	override async transaction<T>(transaction: (tx: MySql2Transaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new MySql2Transaction(
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

function isPool(client: MySql2Client): client is Pool {
	return 'getConnection' in client;
}

export interface MySql2QueryResultHKT extends QueryResultHKT {
	type: MySqlRawQueryResult;
}

export interface MySql2PreparedQueryHKT extends PreparedQueryHKT {
	type: MySql2PreparedQuery<Assume<this['config'], PreparedQueryConfig>>;
}
