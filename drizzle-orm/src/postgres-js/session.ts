import type { Row, RowList, Sql, TransactionSql } from 'postgres';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { PgTransaction } from '~/pg-core';
import type { PgDialect } from '~/pg-core/dialect';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types';
import type { PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core/session';
import { PgSession, PreparedQuery } from '~/pg-core/session';
import { fillPlaceholders, type Query } from '~/sql';
import { type Assume, mapResultRow } from '~/utils';

export class PostgresJsPreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private query: string;

	constructor(
		private client: Sql,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
	) {
		super();
		this.query = queryString;
	}

	execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.query, params);

		const { fields, query, client, joinsNotNullableMap } = this;
		if (!fields) {
			return client.unsafe(query, params as any[]);
		}

		const result = client.unsafe(query, params as any[]).values();

		return result.then((result) => result.map((row) => mapResultRow<T['execute']>(fields, row, joinsNotNullableMap)));
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

export class PostgresJsSession<TSQL extends Sql = Sql> extends PgSession<PostgresJsQueryResultHKT> {
	logger: Logger;

	constructor(
		public client: TSQL,
		dialect: PgDialect,
		/** @internal */
		readonly options: PostgresJsSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
	): PreparedQuery<T> {
		return new PostgresJsPreparedQuery(this.client, query.sql, query.params, this.logger, fields);
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

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.client.begin(async (client) => {
			const session = new PostgresJsSession(client, this.dialect, this.options);
			const tx = new PostgresJsTransaction(this.dialect, session);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PostgresJsTransaction extends PgTransaction<PostgresJsQueryResultHKT> {
	constructor(
		dialect: PgDialect,
		/** @internal */
		override readonly session: PostgresJsSession<TransactionSql>,
		nestedIndex = 0,
	) {
		super(dialect, session, nestedIndex);
	}

	override transaction<T>(
		transaction: (tx: PostgresJsTransaction) => Promise<T>,
	): Promise<T> {
		return this.session.client.savepoint((client) => {
			const session = new PostgresJsSession(client, this.dialect, this.session.options);
			const tx = new PostgresJsTransaction(this.dialect, session);
			return transaction(tx);
		}) as Promise<T>;
	}
}

export interface PostgresJsQueryResultHKT extends QueryResultHKT {
	type: RowList<Assume<this['row'], Row>[]>;
}
