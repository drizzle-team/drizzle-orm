import { type Connection as CallbackConnection } from 'mysql2';
import {
	type Connection,
	type FieldPacket,
	type OkPacket,
	type Pool,
	type QueryOptions,
	type ResultSetHeader,
	type RowDataPacket,
} from 'mysql2/promise';
import { once } from 'node:events';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import type { MySqlDialect } from '~/mysql-core/dialect';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types';
import {
	MySqlSession,
	MySqlTransaction,
	type MySqlTransactionConfig,
	PreparedQuery,
	type PreparedQueryConfig,
	type PreparedQueryHKT,
	type PreparedQueryKind,
	type QueryResultHKT,
} from '~/mysql-core/session';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql';
import { type Assume, mapResultRow } from '~/utils';

export type MySql2Client = Pool | Connection;

export type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];
export type MySqlQueryResultType = RowDataPacket[][] | RowDataPacket[] | OkPacket | OkPacket[] | ResultSetHeader;
export type MySqlQueryResult<
	T = any,
> = [T extends ResultSetHeader ? T : T[], FieldPacket[]];

export class MySql2PreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private rawQuery: QueryOptions;
	private query: QueryOptions;

	constructor(
		private client: MySql2Client,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
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

		const { fields } = this;
		if (!fields) {
			return this.client.query(this.rawQuery, params);
		}

		const result = this.client.query<any[]>(this.query, params);

		return result.then((result) =>
			result[0].map((row) => mapResultRow<T['execute']>(fields, row, this.joinsNotNullableMap))
		);
	}

	async *iterator(
		placeholderValues: Record<string, unknown> = {},
	): AsyncGenerator<T['execute'] extends any[] ? T['execute'][number] : T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		const conn = ((isPool(this.client) ? await this.client.getConnection() : this.client) as {} as {
			connection: CallbackConnection;
		}).connection;

		const { fields } = this;
		const driverQuery = fields ? conn.query(this.query, params) : conn.query(this.rawQuery, params);

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
				} else if (row instanceof Error) {
					throw row;
				} else {
					yield (fields ? mapResultRow(fields, row as unknown[], this.joinsNotNullableMap) : row) as T['execute'];
				}
			}
		} finally {
			stream.off('data', dataListener);
			if (isPool(this.client)) {
				conn.end();
			}
		}
	}
}

export interface MySql2SessionOptions {
	logger?: Logger;
}

export class MySql2Session extends MySqlSession<MySql2QueryResultHKT> {
	private logger: Logger;

	constructor(
		private client: MySql2Client,
		dialect: MySqlDialect,
		private options: MySql2SessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
	): PreparedQueryKind<MySql2PreparedQueryHKT, T> {
		return new MySql2PreparedQuery(this.client, query.sql, query.params, this.logger, fields);
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

	override all<T = unknown>(query: SQL<unknown>): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.client.execute(querySql.sql, querySql.params).then((result) => result[0]) as Promise<T[]>;
	}

	override async transaction<T>(
		transaction: (tx: MySql2Transaction) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T> {
		const session = isPool(this.client)
			? new MySql2Session(await this.client.getConnection(), this.dialect, this.options)
			: this;
		const tx = new MySql2Transaction(this.dialect, session as MySqlSession);
		if (config) {
			const setTransactionConfigSql = this.getSetTransactionSQL(config);
			if (setTransactionConfigSql) {
				await tx.execute(setTransactionConfigSql);
			}
			const startTransactionSql = this.getStartTransactionSQL(config);
			if (startTransactionSql) {
				await tx.execute(startTransactionSql);
			} else {
				await tx.execute(sql`begin`);
			}
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
		}
	}
}

export class MySql2Transaction extends MySqlTransaction<MySql2QueryResultHKT, MySql2PreparedQueryHKT> {
	override async transaction<T>(transaction: (tx: MySql2Transaction) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new MySql2Transaction(this.dialect, this.session, this.nestedIndex + 1);
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
