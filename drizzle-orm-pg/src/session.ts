import { Logger, NoopLogger } from 'drizzle-orm';
import { fillPlaceholders, Query, SQL } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import {
	Client,
	Pool,
	PoolClient,
	QueryArrayConfig,
	QueryConfig,
	QueryResult,
	QueryResultRow,
} from 'pg';

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
	private rawQuery: QueryConfig;
	private query: QueryArrayConfig;

	constructor(
		private client: PgClient,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
	) {
		super();
		this.rawQuery = {
			name,
			text: queryString,
		};
		this.query = {
			...this.rawQuery,
			rowMode: 'array',
		};
	}

	execute(placeholderValues?: Record<string, unknown> | undefined): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});

		this.logger.logQuery(this.rawQuery.text, params);

		const { fields } = this;
		if (!fields) {
			return this.client.query(this.rawQuery, params);
		}

		const result = this.client.query(this.query, params);

		return result.then((result) =>
			result.rows.map((row) => mapResultRow<T['execute']>(fields, row)),
		);
	}
}

export abstract class PgSession {
	constructor(protected dialect: PgDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T>;

	execute<T extends QueryResultRow = QueryResultRow>(query: SQL): Promise<QueryResult<T>> {
		return this.prepareQuery<PreparedQueryConfig & { execute: QueryResult<T> }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
		).execute();
	}
}

export interface NodePgSessionOptions {
	logger?: Logger;
}

export class NodePgSession extends PgSession {
	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T> {
		return new NodePgPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			name,
		);
	}

	private logger: Logger;

	constructor(private client: PgClient, dialect: PgDialect, options: NodePgSessionOptions = {}) {
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
