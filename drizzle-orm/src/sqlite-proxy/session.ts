import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import type { Query } from '~/sql';
import { fillPlaceholders } from '~/sql';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import type { PreparedQueryConfig as PreparedQueryConfigBase, Transaction } from '~/sqlite-core/session';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';
import type { RemoteCallback, SqliteRemoteResult } from './driver';

export interface SQLiteRemoteSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteRemoteSession extends SQLiteSession<'async', SqliteRemoteResult> {
	private logger: Logger;

	constructor(
		private client: RemoteCallback,
		dialect: SQLiteAsyncDialect,
		options: SQLiteRemoteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	exec(query: string): void {
		throw Error('To implement: Proxy SQLite');
		// await this.client.exec(query.sql);
		// return this.client(this.queryString, params).then(({ rows }) => rows!)
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields?: SelectedFieldsOrdered,
	): PreparedQuery<T> {
		return new PreparedQuery(this.client, query.sql, query.params, this.logger, fields);
	}

	override transaction(
		transaction: (tx: Transaction<'async', SqliteRemoteResult>) => void | Promise<void>,
	): Promise<void> {
		throw new Error('Method not implemented.');
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

	async run(placeholderValues?: Record<string, unknown>): Promise<SqliteRemoteResult> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return await this.client(this.queryString, params, 'run');
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields } = this;

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);

		const clientResult = this.client(this.queryString, params, 'all');

		if (fields) {
			return clientResult.then((values) =>
				values.rows.map((row) => mapResultRow(fields, row, this.joinsNotNullableMap))
			);
		}

		return this.client(this.queryString, params, 'all').then(({ rows }) => rows!);
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields } = this;

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);

		const clientResult = await this.client(this.queryString, params, 'get');

		if (fields) {
			if (typeof clientResult.rows === 'undefined') {
				return mapResultRow(fields, [], this.joinsNotNullableMap);
			}
			return mapResultRow(fields, clientResult.rows, this.joinsNotNullableMap);
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
