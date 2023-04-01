import type { BindParams, Database, Statement } from 'sql.js';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import type { Query } from '~/sql';
import { fillPlaceholders } from '~/sql';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import type { PreparedQueryConfig as PreparedQueryConfigBase, Transaction } from '~/sqlite-core/session';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';

export interface SQLJsSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLJsSession extends SQLiteSession<'sync', void> {
	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		options: SQLJsSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	exec(query: string): void {
		this.client.exec(query);
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields?: SelectedFieldsOrdered,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields);
	}

	override prepareOneTimeQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields?: SelectedFieldsOrdered,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields, true);
	}

	override transaction(): Transaction<'sync', void> {
		throw new Error('Method not implemented.');
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
		private fields: SelectedFieldsOrdered | undefined,
		private isOneTimeQuery = false,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): void {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const result = this.stmt.run(params as BindParams);

		if (this.isOneTimeQuery) {
			this.free();
		}

		return result;
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const { fields } = this;
		if (fields) {
			return this.values(placeholderValues).map((row) =>
				mapResultRow(fields, row.map(normalizeFieldValue), this.joinsNotNullableMap)
			);
		}

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		this.stmt.bind(params as BindParams);
		const rows: T['all'] = [];
		while (this.stmt.step()) {
			rows.push(this.stmt.getAsObject());
		}

		if (this.isOneTimeQuery) {
			this.free();
		}

		return rows;
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);

		const { fields } = this;
		if (!fields) {
			const result = this.stmt.getAsObject(params as BindParams);

			if (this.isOneTimeQuery) {
				this.free();
			}

			return result;
		}

		const row = this.stmt.get(params as BindParams);

		if (this.isOneTimeQuery) {
			this.free();
		}

		return mapResultRow(fields, row.map(normalizeFieldValue), this.joinsNotNullableMap);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		this.stmt.bind(params as BindParams);
		const rows: T['values'] = [];
		while (this.stmt.step()) {
			rows.push(this.stmt.get());
		}
		return rows;
	}

	free(): boolean {
		return this.stmt.free();
	}
}

function normalizeFieldValue(value: unknown) {
	if (value instanceof Uint8Array) {
		if (typeof Buffer !== 'undefined') {
			if (!(value instanceof Buffer)) {
				return Buffer.from(value);
			}
			return value;
		}
		if (typeof TextDecoder !== 'undefined') {
			return new TextDecoder().decode(value);
		}
		throw new Error('TextDecoder is not available. Please provide either Buffer or TextDecoder polyfill.');
	}
	return value;
}
