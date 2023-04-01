import {
	type Client,
	type InArgs,
	type InStatement,
	type ResultSet,
	type Transaction as LibSQLNativeTransaction,
} from '@libsql/client';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import type { Query, SQL } from '~/sql';
import { fillPlaceholders } from '~/sql';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import { type PreparedQueryConfig as PreparedQueryConfigBase, Transaction } from '~/sqlite-core/session';
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
		options: LibSQLSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields?: SelectedFieldsOrdered,
		tx?: LibSQLTransaction,
	): PreparedQuery<T> {
		return new PreparedQuery(this.client, tx?.tx, query.sql, query.params, this.logger, fields);
	}

	/*override */ batch(queries: SQL[]): Promise<ResultSet[]> {
		const builtQueries: InStatement[] = queries.map((query) => {
			const builtQuery = this.dialect.sqlToQuery(query);
			return { sql: builtQuery.sql, args: builtQuery.params as InArgs };
		});
		return this.client.batch(builtQueries);
	}

	override async transaction(transaction: (tx: LibSQLTransaction) => void | Promise<void>): Promise<void> {
		const tx = new LibSQLTransaction(this, this.client.transaction());
		try {
			await transaction(tx);
			await (await tx.tx).commit();
		} catch (err) {
			await (await tx.tx).rollback();
			throw err;
		}
	}
}

export class LibSQLTransaction extends Transaction<'async', ResultSet> {
	constructor(
		session: LibSQLSession,
		/** @internal */
		public tx: Promise<LibSQLNativeTransaction>,
	) {
		super(session);
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'async'; run: ResultSet; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private client: Client | LibSQLNativeTransaction,
		private tx: Promise<LibSQLNativeTransaction> | undefined,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): Promise<ResultSet> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const stmt: InStatement = { sql: this.queryString, args: params as InArgs };
		return this.tx ? this.tx.then((tx) => tx.execute(stmt)) : this.client.execute(stmt);
	}

	all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields } = this;
		if (fields) {
			const values = this.values(placeholderValues);

			return values.then((rows) =>
				rows.map((row) => {
					return mapResultRow(
						fields,
						Array.prototype.slice.call(row).map(normalizeFieldValue),
						this.joinsNotNullableMap,
					);
				})
			);
		}

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const stmt: InStatement = { sql: this.queryString, args: params as InArgs };
		return (this.tx ? this.tx.then((tx) => tx.execute(stmt)) : this.client.execute(stmt)).then(({ rows }) =>
			rows.map(normalizeRow)
		);
	}

	get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		return this.all(placeholderValues).then((rows) => rows[0]);
	}

	values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const stmt: InStatement = { sql: this.queryString, args: params as InArgs };
		return (this.tx ? this.tx.then((tx) => tx.execute(stmt)) : this.client.execute(stmt)).then(({ rows }) =>
			rows
		) as Promise<T['values']>;
	}
}

function normalizeRow(obj: any) {
	// The libSQL node-sqlite3 compatibility wrapper returns rows
	// that can be accessed both as objects and arrays. Let's
	// turn them into objects what's what other SQLite drivers
	// do.
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
