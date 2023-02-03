import { Connection, FieldPacket, OkPacket, Pool, QueryOptions, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { Logger, NoopLogger } from '~/logger';
import { MySqlDialect } from '~/mysql-core/dialect';
import { SelectFieldsOrdered } from '~/mysql-core/operations';
import {
	MySqlSession,
	PreparedQuery,
	PreparedQueryConfig,
	QueryResultHKT,
} from '~/mysql-core/session';
import { fillPlaceholders, Query } from '~/sql';
import { mapResultRow } from '~/utils';

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
		private fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
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

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.rawQuery.sql, params);

		const { fields } = this;
		if (!fields) {
			return this.client.query(this.rawQuery, params);
		}

		const result = this.client.query<any[]>(this.query, params);

		return result.then((result) => result[0].map((row) => mapResultRow<T['execute']>(fields, row)));
	}

	async all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.rawQuery.sql, params);
		return this.client.query(this.rawQuery, params).then((result) => result[0]);
	}
}

export interface NodePgSessionOptions {
	logger?: Logger;
}

export class MySql2Session extends MySqlSession {
	private logger: Logger;

	constructor(
		private client: MySql2Client,
		dialect: MySqlDialect,
		options: NodePgSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T> {
		return new MySql2PreparedQuery(this.client, query.sql, query.params, this.logger, fields, name);
	}

	async query(query: string, params: unknown[]): Promise<MySqlQueryResult> {
		this.logger.logQuery(query, params);
		const result = await this.client.query({
			sql: query,
			values: params,
			rowsAsArray: true,
			typeCast: function(field: any, next: any) {
				if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
					console.log('fields', field);
					return field.string();
				}
				return next();
			},
		});
		return result;
	}

	async queryObjects<T extends MySqlQueryResultType = MySqlQueryResultType>(
		query: string,
		params: unknown[],
	): Promise<MySqlQueryResult> {
		return this.client.query<T>(query, params);
	}
}

export interface MySql2QueryResultHKT extends QueryResultHKT {
	type: MySqlRawQueryResult;
}
