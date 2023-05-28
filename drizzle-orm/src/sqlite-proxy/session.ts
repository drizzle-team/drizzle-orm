import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations';
import { fillPlaceholders, type Query, sql } from '~/sql';
import { SQLiteTransaction } from '~/sqlite-core';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import type { PreparedQueryConfig as PreparedQueryConfigBase, SQLiteTransactionConfig } from '~/sqlite-core/session';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';
import { type RemoteCallback, type SqliteRemoteResult } from './driver';

export interface SQLiteRemoteSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', SqliteRemoteResult, TFullSchema, TSchema> {
	private logger: Logger;

	constructor(
		private client: RemoteCallback,
		dialect: SQLiteAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: SQLiteRemoteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields?: SelectedFieldsOrdered,
	): PreparedQuery<T> {
		return new PreparedQuery(this.client, query.sql, query.params, this.logger, fields);
	}

	override async transaction<T>(
		transaction: (tx: SQLiteProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new SQLiteProxyTransaction('async', this.dialect, this, this.schema);
		await this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
		try {
			const result = await transaction(tx);
			await this.run(sql`commit`);
			return result;
		} catch (err) {
			await this.run(sql`rollback`);
			throw err;
		}
	}
}

export class SQLiteProxyTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'async', SqliteRemoteResult, TFullSchema, TSchema> {
	override async transaction<T>(
		transaction: (tx: SQLiteProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new SQLiteProxyTransaction('async', this.dialect, this.session, this.schema, this.nestedIndex + 1);
		await this.session.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await this.session.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'async'; run: SqliteRemoteResult; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private client: RemoteCallback,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): Promise<SqliteRemoteResult> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.client(this.queryString, params, 'run');
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, queryString, logger, joinsNotNullableMap } = this;

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		logger.logQuery(queryString, params);

		const { rows } = await this.client(queryString, params, 'all');

		if (fields) {
			return rows.map((row) => mapResultRow(fields, row, joinsNotNullableMap));
		}

		return this.client(queryString, params, 'all').then(({ rows }) => rows);
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields, queryString, logger, joinsNotNullableMap } = this;

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		logger.logQuery(queryString, params);

		const clientResult = await this.client(queryString, params, 'get');

		if (fields) {
			if (clientResult.rows === undefined) {
				return mapResultRow(fields, [], joinsNotNullableMap);
			}
			return mapResultRow(fields, clientResult.rows, joinsNotNullableMap);
		}

		return clientResult.rows;
	}

	async values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const clientResult = await this.client(this.queryString, params, 'values');
		return clientResult.rows as T[];
	}
}
