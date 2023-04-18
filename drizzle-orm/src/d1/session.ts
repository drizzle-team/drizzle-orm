/// <reference types="@cloudflare/workers-types" />

import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { type Query, sql } from '~/sql';
import { fillPlaceholders } from '~/sql';
import { SQLiteTransaction } from '~/sqlite-core';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session';
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

	prepareQuery(query: Query, fields?: SelectedFieldsOrdered): PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields);
	}

	override async transaction<T>(
		transaction: (tx: D1Transaction) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new D1Transaction(this.dialect, this);
		await this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
		try {
			const result = await transaction(tx);
			await this.run(sql`commit`);
			return result;
		} catch (err) {
			await this.run(sql`rollback`);
			throw err;
		}
	}
}

export class D1Transaction extends SQLiteTransaction<'async', D1Result> {
	override async transaction<T>(transaction: (tx: D1Transaction) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new D1Transaction(this.dialect, this.session, this.nestedIndex + 1);
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
	{ type: 'async'; run: D1Result; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private stmt: D1PreparedStatement,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): Promise<D1Result> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.bind(...params).run();
	}

	all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, joinsNotNullableMap, queryString, logger, stmt } = this;
		if (fields) {
			return this.values(placeholderValues).then((values) =>
				values.map((row) => mapResultRow(fields, row, joinsNotNullableMap))
			);
		}

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		logger.logQuery(queryString, params);
		return stmt.bind(...params).all().then(({ results }) => results!);
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
