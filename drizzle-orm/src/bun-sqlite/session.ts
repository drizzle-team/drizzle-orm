/// <reference types="bun-types" />

import type { Database, Statement as BunStatement } from 'bun:sqlite';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/index.ts';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteExecuteMethod,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface SQLiteBunSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;
type Statement = BunStatement<any>;

export class SQLiteBunSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', void, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'SQLiteBunSession';

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
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper?: (rows: unknown[][]) => unknown,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields, executeMethod, customResultMapper);
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
	static readonly [entityKind]: string = 'SQLiteBunTransaction';

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
	{ type: 'sync'; run: void; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static readonly [entityKind]: string = 'SQLiteBunPreparedQuery';

	constructor(
		private stmt: Statement,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super('sync', executeMethod);
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

		const rows = this.values(placeholderValues) as unknown[][];

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
