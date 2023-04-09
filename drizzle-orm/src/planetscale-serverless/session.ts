import type { Connection, ExecutedQuery, Transaction } from '@planetscale/database';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import type { MySqlDialect } from '~/mysql-core/dialect';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types';
import {
	MySqlSession,
	MySqlTransaction,
	PreparedQuery,
	type PreparedQueryConfig,
	type QueryResultHKT,
} from '~/mysql-core/session';
import { fillPlaceholders, type Query, sql } from '~/sql';
import { mapResultRow } from '~/utils';

export type PlanetScaleConnection = Connection;

export class PlanetScalePreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private rawQuery = { as: 'object' } as const;
	private query = { as: 'array' } as const;

	constructor(
		private client: PlanetScaleConnection | Transaction,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
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

		return result.then((eQuery) =>
			eQuery.rows.map((row) => mapResultRow<T['execute']>(fields, row as unknown[], this.joinsNotNullableMap))
		);
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
	private client: PlanetScaleConnection | Transaction;

	constructor(
		private baseClient: PlanetScaleConnection,
		dialect: MySqlDialect,
		tx: Transaction | undefined,
		private options: PlanetscaleSessionOptions = {},
	) {
		super(dialect);
		this.client = tx ?? baseClient;
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T> {
		return new PlanetScalePreparedQuery(this.client, query.sql, query.params, this.logger, fields, name);
	}

	async query(query: string, params: unknown[]): Promise<ExecutedQuery> {
		this.logger.logQuery(query, params);

		return await this.client.execute(query, params, { as: 'array' });
	}

	async queryObjects(
		query: string,
		params: unknown[],
	): Promise<ExecutedQuery> {
		return this.client.execute(query, params, { as: 'object' });
	}

	override transaction<T>(
		transaction: (tx: MySqlTransaction<QueryResultHKT>) => Promise<T>,
	): Promise<T> {
		return this.baseClient.transaction((pstx) => {
			const session = new PlanetscaleSession(this.baseClient, this.dialect, pstx, this.options);
			const tx = new PlanetScaleTransaction(this.dialect, session);
			return transaction(tx);
		});
	}
}

export class PlanetScaleTransaction extends MySqlTransaction<PlanetscaleQueryResultHKT> {
	override async transaction<T>(transaction: (tx: PlanetScaleTransaction) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new PlanetScaleTransaction(this.dialect, this.session, this.nestedIndex + 1);
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

export interface PlanetscaleQueryResultHKT extends QueryResultHKT {
	type: ExecutedQuery;
}
