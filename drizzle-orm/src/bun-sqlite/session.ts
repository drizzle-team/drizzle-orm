/// <reference types="bun-types" />

import type { Database, Statement as BunStatement } from 'bun:sqlite';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { fillPlaceholders, type Query, sql } from '~/sql';
import { SQLiteTransaction } from '~/sqlite-core';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import type { PreparedQueryConfig as PreparedQueryConfigBase, SQLiteTransactionConfig } from '~/sqlite-core/session';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session';
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
		fields?: SelectedFieldsOrdered,
		mapResult?: (result: unknown) => unknown,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields, mapResult);
	}

	override transaction<T>(transaction: (tx: SQLiteBunTransaction) => T, config: SQLiteTransactionConfig = {}): T {
		const tx = new SQLiteBunTransaction(this.dialect, this);
		let result: T | undefined;
		const nativeTx = this.client.transaction(() => {
			result = transaction(tx);
		});
		nativeTx[config.behavior ?? 'deferred']();
		return result!;
	}
}

export class SQLiteBunTransaction extends SQLiteTransaction<'sync', void> {
	override transaction<T>(transaction: (tx: SQLiteBunTransaction) => T): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new SQLiteBunTransaction(this.dialect, this.session, this.nestedIndex + 1);
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
	{ type: 'sync'; run: void; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private stmt: Statement,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private mapResult?: (result: unknown) => unknown,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): void {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.run(...params);
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const { fields, queryString, logger, joinsNotNullableMap, stmt, mapResult } = this;
		if (!fields && !mapResult) {
			const params = fillPlaceholders(this.params, placeholderValues ?? {});
			logger.logQuery(queryString, params);
			return stmt.all(...params);
		}

		const rows = this.values(placeholderValues);

		if (mapResult) {
			return mapResult(rows) as T['all'];
		}

		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const value = this.stmt.get(...params);

		if (!value) {
			return undefined;
		}

		const { fields, joinsNotNullableMap, mapResult } = this;
		if (!fields && !mapResult) {
			return value;
		}

		if (mapResult) {
			return mapResult(value) as T['get'];
		}

		return mapResultRow(fields!, value, joinsNotNullableMap);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.values(...params);
	}
}
