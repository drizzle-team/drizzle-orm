import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteExecuteMethod,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';
import type { RemoteCallback, SqliteRemoteResult } from './driver.ts';

export interface SQLiteRemoteSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', SqliteRemoteResult, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'SQLiteRemoteSession';

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
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
	): PreparedQuery<T> {
		return new PreparedQuery(this.client, query, this.logger, fields, executeMethod);
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
	static readonly [entityKind]: string = 'SQLiteProxyTransaction';

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
	{ type: 'async'; run: SqliteRemoteResult; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static readonly [entityKind]: string = 'SQLiteProxyPreparedQuery';

	constructor(
		private client: RemoteCallback,
		query: Query,
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
	) {
		super('async', executeMethod, query);
	}

	run(placeholderValues?: Record<string, unknown>): Promise<SqliteRemoteResult> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.client(this.query.sql, params, 'run');
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, query, logger, joinsNotNullableMap } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const { rows } = await this.client(query.sql, params, 'all');

		if (fields) {
			return rows.map((row) => mapResultRow(fields, row, joinsNotNullableMap));
		}

		return rows;
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields, query, logger, joinsNotNullableMap } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const clientResult = await this.client(query.sql, params, 'get');

		if (fields) {
			if (clientResult.rows === undefined) {
				return undefined;
			}
			return mapResultRow(fields, clientResult.rows, joinsNotNullableMap);
		}

		return clientResult.rows;
	}

	async values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const clientResult = await this.client(this.query.sql, params, 'values');
		return clientResult.rows as T[];
	}
}
