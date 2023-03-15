/// <reference types="bun-types" />

import type { Database, Statement as BunStatement } from 'bun:sqlite';
import type { Logger} from '~/logger';
import { NoopLogger } from '~/logger';
import type { Query } from '~/sql';
import { fillPlaceholders } from '~/sql';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import type { SelectFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase} from '~/sqlite-core/session';
import {
	PreparedQuery as PreparedQueryBase,
	SQLiteSession,
} from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';

export interface SQLiteBunSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;
type Statement = BunStatement<any>;

export class SQLiteBunSession extends SQLiteSession<'sync', void> {
	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		options: SQLiteBunSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	exec(query: string): void {
		this.client.exec(query);
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields?: SelectFieldsOrdered,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields);
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'sync'; run: void; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private stmt: Statement,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectFieldsOrdered | undefined,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): void {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.run(...params);
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const { fields } = this;
		if (fields) {
			return this.values(placeholderValues).map((row) => mapResultRow(fields, row, this.joinsNotNullableMap));
		}

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.all(...params);
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const value = this.stmt.get(...params);

		const { fields } = this;
		if (!fields) {
			return value;
		}

		return mapResultRow(fields, value, this.joinsNotNullableMap);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.values(...params);
	}
}
