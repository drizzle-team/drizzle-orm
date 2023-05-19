/// <reference types="bun-types" />

import type { Database, Statement as BunStatement } from 'bun:sqlite';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations';
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

export class SQLiteBunSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', void, TFullSchema, TSchema> {
	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
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
		customResultMapper?: (rows: unknown[][]) => unknown,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields, customResultMapper);
	}

	override transaction<T>(
		transaction: (tx: SQLiteBunTransaction<TFullSchema, TSchema>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new SQLiteBunTransaction('sync', this.dialect, this, this.schema);
		let result: T | undefined;
		const nativeTx = this.client.transaction(() => {
			result = transaction(tx);
		});
		nativeTx[config.behavior ?? 'deferred']();
		return result!;
	}
}

export class SQLiteBunTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'sync', void, TFullSchema, TSchema> {
	override transaction<T>(transaction: (tx: SQLiteBunTransaction<TFullSchema, TSchema>) => T): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new SQLiteBunTransaction('sync', this.dialect, this.session, this.schema, this.nestedIndex + 1);
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
		private customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): void {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.run(...params);
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const { fields, queryString, logger, joinsNotNullableMap, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(this.params, placeholderValues ?? {});
			logger.logQuery(queryString, params);
			return stmt.all(...params);
		}

		const rows = this.values(placeholderValues);

		if (customResultMapper) {
			return customResultMapper(rows) as T['all'];
		}

		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const row = this.stmt.get(...params);

		if (!row) {
			return undefined;
		}

		const { fields, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			return row;
		}

		if (customResultMapper) {
			return customResultMapper([row]) as T['get'];
		}

		return mapResultRow(fields!, row, joinsNotNullableMap);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.values(...params);
	}
}
