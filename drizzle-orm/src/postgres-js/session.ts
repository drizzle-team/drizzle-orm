import { Row, RowList, Sql } from 'postgres';
import { Logger, NoopLogger } from '~/logger';
import { PgDialect } from '~/pg-core/dialect';
import { SelectFieldsOrdered } from '~/pg-core/query-builders/select.types';
import { PgSession, PreparedQuery, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session';
import { fillPlaceholders, Query } from '~/sql';
import { Assume } from '~/utils';
import { mapResultRow } from '~/utils';

export class PostgresJsPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private query: string;

	constructor(
		private client: Sql,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
	) {
		super();
		this.query = queryString;
	}

	execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.query, params);

		const { fields } = this;
		if (!fields) {
			return this.client.unsafe(this.query, params as any[]);
		}

		const result = this.client.unsafe(this.query, params as any[]).values();

		return result.then((result) => result.map((row) => mapResultRow<T['execute']>(fields, row)));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.query, params);
		return this.client.unsafe(this.query, params as any[]);
	}

	values(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.query, params);
		return this.client.unsafe(this.query, params as any[]).values();
	}
}

export interface PostgresJsSessionOptions {
	logger?: Logger;
}

export class PostgresJsSession extends PgSession {
	logger: Logger;

	constructor(
		public client: Sql,
		dialect: PgDialect,
		options: PostgresJsSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T> {
		return new PostgresJsPreparedQuery(this.client, query.sql, query.params, this.logger, fields, name);
	}

	query(query: string, params: unknown[]): Promise<RowList<Row[]>> {
		this.logger.logQuery(query, params);
		return this.client.unsafe(query, params as any[]).values();
	}

	queryObjects<T extends Row>(
		query: string,
		params: unknown[],
	): Promise<RowList<T[]>> {
		return this.client.unsafe(query, params as any[]);
	}
}

export interface PostgresJsQueryResultHKT extends QueryResultHKT {
	type: RowList<Assume<this['row'], Row>[]>;
}
