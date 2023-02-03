import { connect, Connection, ExecutedQuery } from '@planetscale/database';
import { Logger, NoopLogger } from '~/logger';
import { MySqlDialect } from '~/mysql-core/dialect';
import { SelectFieldsOrdered } from '~/mysql-core/query-builders/select.types';
import { MySqlSession, PreparedQuery, PreparedQueryConfig, QueryResultHKT } from '~/mysql-core/session';
import { fillPlaceholders, Query } from '~/sql';
import { mapResultRow } from '~/utils';

// P stays for Planetscale
export type PExecuteAs = 'array' | 'object';
export type PExecuteOptions = {
	as?: PExecuteAs;
};

export type PlanetScaleConnection = Connection;

export class PlanetScalePreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private rawQuery: PExecuteOptions = { as: 'object' };
	private query: PExecuteOptions = { as: 'array' };

	constructor(
		private client: PlanetScaleConnection,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
	) {
		super();
	}
	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.queryString, params);

		const { fields } = this;
		if (!fields) {
			return this.client.execute(this.queryString, params, this.rawQuery);
		}

		const result = this.client.execute(this.queryString, params, this.query);

		return result.then((eQuery) => eQuery.rows.map((row) => mapResultRow<T['execute']>(fields, row as unknown[])));
	}

	async all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);
		return this.client.execute(this.queryString, params, this.rawQuery).then((eQuery) => eQuery.rows);
	}
}

export interface PlanetscaleSessionOptions {
	logger?: Logger;
}

export class PlanetscaleSession extends MySqlSession {
	private logger: Logger;

	constructor(
		private client: PlanetScaleConnection,
		dialect: MySqlDialect,
		options: PlanetscaleSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T> {
		return new PlanetScalePreparedQuery(this.client, query.sql, query.params, this.logger, fields, name);
	}

	async query(query: string, params: unknown[]): Promise<ExecutedQuery> {
		this.logger.logQuery(query, params);

		return await this.client.execute(query, params, { as: 'array' });
	}

	async transaction(queries: { sql: string; params?: any[] }[]) {
		await this.client.transaction(async (tx) => {
			for (const query of queries) {
				await tx.execute(query.sql, query.params);
			}
		});
	}

	async queryObjects(
		query: string,
		params: unknown[],
	): Promise<ExecutedQuery> {
		return this.client.execute(query, params, { as: 'object' });
	}
}

export interface PlanetscaleQueryResultHKT extends QueryResultHKT {
	type: ExecutedQuery;
}
