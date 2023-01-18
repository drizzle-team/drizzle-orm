import { Logger, NoopLogger } from 'drizzle-orm';
import { fillPlaceholders, Query } from 'drizzle-orm/sql';
import { mapResultRow } from 'drizzle-orm/utils';
import { BindParams, Database, Statement } from 'sql.js';
import { SQLiteSyncDialect } from '~/dialect';
import { SelectFieldsOrdered } from '~/operations';
import {
	PreparedQuery as PreparedQueryBase,
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteSession,
} from '~/session';

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
		fields?: SelectFieldsOrdered,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields);
	}

	override prepareOneTimeQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields?: SelectFieldsOrdered,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields, true);
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
			return this.values(placeholderValues).map((row) => mapResultRow(fields, row.map(normalizeFieldValue)));
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

		return mapResultRow(fields, row.map(normalizeFieldValue));
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
	if (value instanceof Uint8Array && !(value instanceof Buffer)) {
		return Buffer.from(value);
	}
	return value;
}
