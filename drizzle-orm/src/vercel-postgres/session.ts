import {
	type QueryArrayConfig,
	type QueryConfig,
	type QueryResult,
	type QueryResultRow,
	type VercelPoolClient, VercelPool,
	type VercelClient,
} from '@vercel/postgres';
import { type Logger, NoopLogger } from '~/logger';
import { type PgDialect, PgTransaction } from '~/pg-core';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session';
import { PgSession, PreparedQuery } from '~/pg-core/session';
import { fillPlaceholders, type Query, sql } from '~/sql';
import { type Assume, mapResultRow } from '~/utils';

export type VercelPgClient = VercelPool | VercelClient | VercelPoolClient;

export class VercelPgPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private rawQuery: QueryConfig;
	private query: QueryArrayConfig;

	constructor(
		private client: VercelPgClient,
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

		const { fields, rawQuery, client, query, joinsNotNullableMap } = this;
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

export interface VercelPgSessionOptions {
	logger?: Logger;
}

export class VercelPgSession extends PgSession<VercelPgQueryResultHKT> {
	private logger: Logger;

	constructor(
		private client: VercelPgClient,
		dialect: PgDialect,
		private options: VercelPgSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
	): PreparedQuery<T> {
		return new VercelPgPreparedQuery(this.client, query.sql, query.params, this.logger, fields, name);
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
		transaction: (tx: VercelPgTransaction) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const session = this.client instanceof VercelPool
			? new VercelPgSession(await this.client.connect(), this.dialect, this.options)
			: this;
		const tx = new VercelPgTransaction(this.dialect, session);
		await tx.execute(sql`begin${config ? sql` ${tx.getTransactionConfigSQL(config)}` : undefined}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		} finally {
			if (this.client instanceof VercelPool) {
				(session.client as VercelPoolClient).release();
			}
		}
	}
}

export class VercelPgTransaction extends PgTransaction<VercelPgQueryResultHKT> {
	override async transaction<T>(transaction: (tx: VercelPgTransaction) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new VercelPgTransaction(this.dialect, this.session, this.nestedIndex + 1);
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

export interface VercelPgQueryResultHKT extends QueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
