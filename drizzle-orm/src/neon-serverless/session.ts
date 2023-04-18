import {
	type Client,
	Pool,
	type PoolClient,
	type QueryArrayConfig,
	type QueryConfig,
	type QueryResult,
	type QueryResultRow,
} from '@neondatabase/serverless';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { PgTransaction } from '~/pg-core';
import type { PgDialect } from '~/pg-core/dialect';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session';
import { PgSession, PreparedQuery } from '~/pg-core/session';
import { fillPlaceholders, type Query, sql } from '~/sql';
import { type Assume, mapResultRow } from '~/utils';

export type NeonClient = Pool | PoolClient | Client;

export class NeonPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private rawQuery: QueryConfig;
	private query: QueryArrayConfig;

	constructor(
		private client: NeonClient,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
	) {
		super();
		this.rawQuery = {
			name,
			text: queryString,
		};
		this.query = {
			name,
			text: queryString,
			rowMode: 'array',
		};
	}

	execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.rawQuery.text, params);

		const { fields, client, rawQuery, query, joinsNotNullableMap } = this;
		if (!fields) {
			return client.query(rawQuery, params);
		}

		const result = client.query(query, params);

		return result.then((result) =>
			result.rows.map((row) => mapResultRow<T['execute']>(fields, row, joinsNotNullableMap))
		);
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.rawQuery.text, params);
		return this.client.query(this.rawQuery, params).then((result) => result.rows);
	}

	values(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.rawQuery.text, params);
		return this.client.query(this.query, params).then((result) => result.rows);
	}
}

export interface NeonSessionOptions {
	logger?: Logger;
}

export class NeonSession extends PgSession<NeonQueryResultHKT> {
	private logger: Logger;

	constructor(
		private client: NeonClient,
		dialect: PgDialect,
		private options: NeonSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T> {
		return new NeonPreparedQuery(this.client, query.sql, query.params, this.logger, fields, name);
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

	override async transaction<T>(
		transaction: (tx: NeonTransaction) => Promise<T>,
		config: PgTransactionConfig = {},
	): Promise<T> {
		const session = this.client instanceof Pool
			? new NeonSession(await this.client.connect(), this.dialect, this.options)
			: this;
		const tx = new NeonTransaction(this.dialect, session);
		await tx.execute(sql`begin ${tx.getTransactionConfigSQL(config)}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		} finally {
			if (this.client instanceof Pool) {
				(session.client as PoolClient).release();
			}
		}
	}
}

export class NeonTransaction extends PgTransaction<NeonQueryResultHKT> {
	override async transaction<T>(transaction: (tx: NeonTransaction) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NeonTransaction(this.dialect, this.session, this.nestedIndex + 1);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (e) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw e;
		}
	}
}

export interface NeonQueryResultHKT extends QueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
