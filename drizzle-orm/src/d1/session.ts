/// <reference types="@cloudflare/workers-types" />

import { Logger, NoopLogger } from '~/logger';
import { fillPlaceholders, Query } from '~/sql';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import { SelectFieldsOrdered } from '~/sqlite-core/operations';
import {
	PreparedQuery as PreparedQueryBase,
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteSession,
} from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';

export interface SQLiteD1SessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteD1Session extends SQLiteSession<'async', D1Result> {
	private logger: Logger;

	constructor(
		private client: D1Database,
		dialect: SQLiteAsyncDialect,
		options: SQLiteD1SessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	exec(query: string): void {
		throw Error('To implement: D1 migrator');
		// await this.client.exec(query.sql);
	}

	prepareQuery(query: Query, fields?: SelectFieldsOrdered): PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields);
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'async'; run: D1Result; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private stmt: D1PreparedStatement,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectFieldsOrdered | undefined,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): Promise<D1Result> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.bind(...params).run();
	}

	all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields } = this;
		if (fields) {
			return this.values(placeholderValues).then((values) => values.map((row) => mapResultRow(fields, row)));
		}

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.bind(...params).all().then(({ results }) => results!);
	}

	get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		// TODO: implement using stmt.get()
		return this.all(placeholderValues).then((rows) => rows[0]);
	}

	values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.bind(...params).raw();
	}
}
