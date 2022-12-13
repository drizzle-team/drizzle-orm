import { Logger, NoopLogger } from 'drizzle-orm';
import { fillPlaceholders, Query } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { Connection, Pool, QueryOptions } from 'mysql2/promise';
import { MySqlDialect } from '~/dialect';
import { SelectFieldsOrdered } from '~/operations';
import { MySqlQueryResult, MySqlQueryResultType, MySqlSession, PreparedQuery, PreparedQueryConfig } from '~/session';

export type MySql2Client = Pool | Connection;

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
		};
		this.query = {
			sql: queryString,
			rowsAsArray: true
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
				if (field.type === 'TIMESTAMP') {
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
