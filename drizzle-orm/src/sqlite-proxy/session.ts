import { Logger, NoopLogger } from '~/logger';
import { fillPlaceholders, Query } from '~/sql';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import { SelectFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import {
	PreparedQuery as PreparedQueryBase,
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteSession,
} from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';
import { RemoteCallback, SqliteRemoteResult } from './driver';

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
		fields?: SelectFieldsOrdered,
	): PreparedQuery<T> {
		return new PreparedQuery(this.client, query.sql, query.params, this.logger, fields);
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
		private fields: SelectFieldsOrdered | undefined,
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
		if (fields) {
			return this.values(placeholderValues).then((values) =>
				values.map((row) => mapResultRow(fields, row, this.joinsNotNullableMap))
			);
		}

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.client(this.queryString, params, 'all').then(({ rows }) => rows!);
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		return await this.all(placeholderValues).then((rows) => rows[0]);
	}

	async values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const clientResult = await this.client(this.queryString, params, 'values');
		return clientResult.rows as T[];
	}
}
