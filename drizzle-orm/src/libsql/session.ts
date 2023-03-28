import type { Database, Statement } from '@libsql/sqlite3';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import type { Query } from '~/sql';
import { fillPlaceholders } from '~/sql';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import type { PreparedQueryConfig as PreparedQueryConfigBase } from '~/sqlite-core/session';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';

export interface LibSQLSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class LibSQLSession extends SQLiteSession<'async', void> {
	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteAsyncDialect,
		options: LibSQLSessionOptions = {},
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
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'async'; run: void; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private stmt: Statement,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
	) {
		super();
		// FIXME: when to call stmt.finalize()?
	}

	run(placeholderValues?: Record<string, unknown>): Promise<void> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return new Promise((resolve, reject) => {
			this.stmt.run(params, (err) => {
				if (err) {
					return reject(err);
				}
				resolve();
			});
		});
	}

	all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields } = this;
		if (fields) {
			const values = this.values(placeholderValues);

			return values.then((rows) =>
				rows.map((row) => mapResultRow(fields, row.map(normalizeFieldValue), this.joinsNotNullableMap))
			);
		}
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return new Promise((resolve, reject) => {
			const rows: T['all'] = [];
			this.stmt.each(params, (err, row) => {
				if (err) {
					return reject(err);
				}
				return rows.push(normalizeRow(row));
			}, () => {
				resolve(rows);
			});
		});
	}

	get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		// TODO: implement using stmt.get()
		return this.all(placeholderValues).then((rows) => rows[0]);
	}

	values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return new Promise((resolve) => {
			const rows: T['values'] = [];
			this.stmt.each(params, (error, row) => rows.push(row ? Object.values(row) : []), () => {
				resolve(rows);
			});
		});
	}
}

function normalizeRow(obj: any) {
	// The libSQL node-sqlite3 compatibility wrapper returns rows
	// that can be accessed both as objects and arrays. Let's
	// turn them into objects what's what other SQLite drivers
	// d.
	return Object.keys(obj).reduce((acc: Record<string, any>, key) => {
		if (obj.propertyIsEnumerable(key)) {
			acc[key] = obj[key];
		}
		return acc;
	}, {});
}

function normalizeFieldValue(value: unknown) {
	if (value instanceof ArrayBuffer) {
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
