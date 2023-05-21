import type { BindParams, Database, Statement } from 'sql.js';
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

export interface SQLJsSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLJsSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', void, TFullSchema, TSchema> {
	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: SQLJsSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
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
		customResultMapper?: (rows: unknown[][]) => unknown,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields, customResultMapper, true);
	}

	override transaction<T>(
		transaction: (tx: SQLJsTransaction<TFullSchema, TSchema>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new SQLJsTransaction('sync', this.dialect, this, this.schema);
		this.run(sql.raw(`begin${config.behavior ? ` ${config.behavior}` : ''}`));
		try {
			const result = transaction(tx);
			this.run(sql`commit`);
			return result;
		} catch (err) {
			this.run(sql`rollback`);
			throw err;
		}
	}
}

export class SQLJsTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'sync', void, TFullSchema, TSchema> {
	override transaction<T>(transaction: (tx: SQLJsTransaction<TFullSchema, TSchema>) => T): T {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new SQLJsTransaction('sync', this.dialect, this.session, this.schema, this.nestedIndex + 1);
		tx.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = transaction(tx);
			tx.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			tx.run(sql.raw(`rollback to savepoint ${savepointName}`));
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
		private customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
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
		const { fields, joinsNotNullableMap, logger, queryString, stmt, isOneTimeQuery, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(this.params, placeholderValues ?? {});
			logger.logQuery(queryString, params);
			stmt.bind(params as BindParams);
			const rows: T['all'] = [];
			while (stmt.step()) {
				rows.push(stmt.getAsObject());
			}

			if (isOneTimeQuery) {
				this.free();
			}

			return rows;
		}

		const rows = this.values(placeholderValues);

		if (customResultMapper) {
			return customResultMapper(rows, normalizeFieldValue) as T['all'];
		}

		return rows.map((row) => mapResultRow(fields!, row.map((v) => normalizeFieldValue(v)), joinsNotNullableMap));
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);

		const { fields, stmt, isOneTimeQuery, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const result = stmt.getAsObject(params as BindParams);

			if (isOneTimeQuery) {
				this.free();
			}

			return result;
		}

		const row = stmt.get(params as BindParams);

		if (isOneTimeQuery) {
			this.free();
		}

		if (!row) {
			return undefined;
		}

		if (customResultMapper) {
			return customResultMapper([row], normalizeFieldValue) as T['get'];
		}

		return mapResultRow(fields!, row.map((v) => normalizeFieldValue(v)), joinsNotNullableMap);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		this.stmt.bind(params as BindParams);
		const rows: T['values'] = [];
		while (this.stmt.step()) {
			rows.push(this.stmt.get());
		}

		if (this.isOneTimeQuery) {
			this.free();
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
