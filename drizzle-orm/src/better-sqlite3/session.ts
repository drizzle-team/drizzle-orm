import type { Database, RunResult, Statement } from 'better-sqlite3';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { fillPlaceholders, type Query, sql } from '~/sql';
import { SQLiteTransaction } from '~/sqlite-core';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import type { PreparedQueryConfig as PreparedQueryConfigBase, SQLiteTransactionConfig } from '~/sqlite-core/session';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';

export interface BetterSQLiteSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class BetterSQLiteSession extends SQLiteSession<'sync', RunResult> {
	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		options: BetterSQLiteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields);
	}

	override transaction<T>(transaction: (tx: BetterSQLiteTransaction) => T, config: SQLiteTransactionConfig = {}): T {
		const tx = new BetterSQLiteTransaction(this.dialect, this);
		const nativeTx = this.client.transaction(transaction);
		return nativeTx[config.behavior ?? 'deferred'](tx);
	}
}

export class BetterSQLiteTransaction extends SQLiteTransaction<'sync', RunResult> {
	override transaction<T>(transaction: (tx: BetterSQLiteTransaction) => T): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new BetterSQLiteTransaction(this.dialect, this.session, this.nestedIndex + 1);
		this.session.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = transaction(tx);
			this.session.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'sync'; run: RunResult; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private stmt: Statement,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): RunResult {
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

		const { fields } = this;
		if (!fields) {
			return this.stmt.get(...params);
		}

		const value = this.stmt.raw().get(...params);

		if (!value) {
			return undefined;
		}

		return mapResultRow(fields, value, this.joinsNotNullableMap);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.raw().all(...params);
	}
}
