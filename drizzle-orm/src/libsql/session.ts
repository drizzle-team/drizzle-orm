import { type Client, type InArgs, type InStatement, type ResultSet, type Transaction } from '@libsql/client';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql';
import { SQLiteTransaction } from '~/sqlite-core';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';

export interface LibSQLSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class LibSQLSession extends SQLiteSession<'async', ResultSet> {
	private logger: Logger;

	constructor(
		private client: Client,
		dialect: SQLiteAsyncDialect,
		private options: LibSQLSessionOptions,
		private tx: Transaction | undefined,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered,
	): PreparedQuery<T> {
		return new PreparedQuery(this.client, query.sql, query.params, this.logger, fields, this.tx);
	}

	/*override */ batch(queries: SQL[]): Promise<ResultSet[]> {
		const builtQueries: InStatement[] = queries.map((query) => {
			const builtQuery = this.dialect.sqlToQuery(query);
			return { sql: builtQuery.sql, args: builtQuery.params as InArgs };
		});
		return this.client.batch(builtQueries);
	}

	override async transaction<T>(
		transaction: (db: LibSQLTransaction) => T | Promise<T>,
		_config?: SQLiteTransactionConfig,
	): Promise<T> {
		// TODO: support transaction behavior
		const libsqlTx = await this.client.transaction();
		const session = new LibSQLSession(this.client, this.dialect, this.options, libsqlTx);
		const tx = new LibSQLTransaction(this.dialect, session);
		try {
			const result = await transaction(tx);
			await libsqlTx.commit();
			return result;
		} catch (err) {
			await libsqlTx.rollback();
			throw err;
		}
	}
}

export class LibSQLTransaction extends SQLiteTransaction<'async', ResultSet> {
	override async transaction<T>(transaction: (tx: LibSQLTransaction) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new LibSQLTransaction(this.dialect, this.session, this.nestedIndex + 1);
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
	{ type: 'async'; run: ResultSet; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private client: Client,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private tx: Transaction | undefined,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): Promise<ResultSet> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const stmt: InStatement = { sql: this.queryString, args: params as InArgs };
		return this.tx ? this.tx.execute(stmt) : this.client.execute(stmt);
	}

	all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, joinsNotNullableMap, logger, queryString, tx, client } = this;
		if (fields) {
			const values = this.values(placeholderValues);

			return values.then((rows) =>
				rows.map((row) => {
					return mapResultRow(
						fields,
						Array.prototype.slice.call(row).map((v) => normalizeFieldValue(v)),
						joinsNotNullableMap,
					);
				})
			);
		}

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		logger.logQuery(queryString, params);
		const stmt: InStatement = { sql: queryString, args: params as InArgs };
		return (tx ? tx.execute(stmt) : client.execute(stmt)).then(({ rows }) => rows.map((row) => normalizeRow(row)));
	}

	get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		return this.all(placeholderValues).then((rows) => rows[0]);
	}

	values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const stmt: InStatement = { sql: this.queryString, args: params as InArgs };
		return (this.tx ? this.tx.execute(stmt) : this.client.execute(stmt)).then(({ rows }) => rows) as Promise<
			T['values']
		>;
	}
}

function normalizeRow(obj: any) {
	// The libSQL node-sqlite3 compatibility wrapper returns rows
	// that can be accessed both as objects and arrays. Let's
	// turn them into objects what's what other SQLite drivers
	// do.
	return Object.keys(obj).reduce((acc: Record<string, any>, key) => {
		if (Object.prototype.propertyIsEnumerable.call(obj, key)) {
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
