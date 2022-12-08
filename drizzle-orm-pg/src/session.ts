import { Logger, NoopLogger } from 'drizzle-orm';
import { fillPlaceholders, Query, SQL } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { Client, Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { PgDialect } from './dialect';
import { SelectFieldsOrdered } from './operations';

export type PgClient = Pool | PoolClient | Client;

export interface PreparedQueryConfig {
	execute: unknown;
}

export abstract class PreparedQuery<T extends PreparedQueryConfig> {
	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;
}

export class NodePgPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	constructor(
		private client: PgClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectFieldsOrdered | undefined,
	) {
		super();
	}

	execute(placeholderValues?: Record<string, unknown> | undefined): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});

		this.logger.logQuery(this.queryString, params);

		const { fields } = this;
		if (!fields) {
			return this.client.query(this.queryString, params);
		}

		const result = this.client.query({
			rowMode: 'array',
			text: this.queryString,
			values: params,
		});

		return result.then((result) => result.rows.map((row) => mapResultRow<T['execute']>(fields, row)));
	}

	// values(placeholderValues?: Record<string, unknown> | undefined): Promise<QueryResult<T['values']>> {
	// 	const params = fillPlaceholders(this.params, placeholderValues ?? {});

	// 	this.logger.logQuery(this.queryString, params);

	// 	return this.client.query({
	// 		rowMode: 'array',
	// 		text: this.queryString,
	// 		values: params,
	// 	});
	// }
}

export abstract class PgSession {
	constructor(protected dialect: PgDialect) {
	}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields?: SelectFieldsOrdered,
	): PreparedQuery<T>;

	execute<T extends QueryResultRow = QueryResultRow>(query: SQL): Promise<QueryResult<T>> {
		return this.prepareQuery<PreparedQueryConfig & { execute: QueryResult<T> }>(this.dialect.sqlToQuery(query))
			.execute();
	}
}

export interface NodePgSessionOptions {
	logger?: Logger;
}

export class NodePgSession extends PgSession {
	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields?: SelectFieldsOrdered | undefined,
	): PreparedQuery<T> {
		return new NodePgPreparedQuery(this.client, query.sql, query.params, this.logger, fields);
	}

	private logger: Logger;

	constructor(
		private client: PgClient,
		dialect: PgDialect,
		options: NodePgSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	async query(query: string, params: unknown[]): Promise<QueryResult> {
		this.logger.logQuery(query, params);
		const result = await this.client.query({
			rowMode: 'array',
			text: query,
			values: params,
		});
		return result;
	}

	async queryObjects<T extends QueryResultRow>(
		query: string,
		params: unknown[],
	): Promise<QueryResult<T>> {
		return this.client.query<T>(query, params);
	}
}
