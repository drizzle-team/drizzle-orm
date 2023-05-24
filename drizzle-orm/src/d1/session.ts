/// <reference types="@cloudflare/workers-types" />

import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations';
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

export class SQLiteD1Session<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', D1Result, TFullSchema, TSchema> {
	private logger: Logger;

	constructor(
		private client: D1Database,
		dialect: SQLiteAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: SQLiteD1SessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery(
		query: Query,
		fields?: SelectedFieldsOrdered,
		customResultMapper?: (rows: unknown[][]) => unknown,
	): PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields, customResultMapper);
	}

	override async transaction<T>(
		transaction: (tx: D1Transaction<TFullSchema, TSchema>) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new D1Transaction('async', this.dialect, this, this.schema);
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

export class D1Transaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'async', D1Result, TFullSchema, TSchema> {
	override async transaction<T>(transaction: (tx: D1Transaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new D1Transaction('async', this.dialect, this.session, this.schema, this.nestedIndex + 1);
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
		private customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): Promise<D1Result> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.bind(...params).run();
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, joinsNotNullableMap, queryString, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(this.params, placeholderValues ?? {});
			logger.logQuery(queryString, params);
			return stmt.bind(...params).all().then(({ results }) => results!);
		}

		const rows = await this.values(placeholderValues);

		if (customResultMapper) {
			return customResultMapper(rows) as T['all'];
		}

		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields, joinsNotNullableMap, queryString, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(this.params, placeholderValues ?? {});
			logger.logQuery(queryString, params);
			return stmt.bind(...params).all().then(({ results }) => results![0]);
		}

		const rows = await this.values(placeholderValues);

		if (!rows[0]) {
			return undefined;
		}

		if (customResultMapper) {
			return customResultMapper(rows) as T['all'];
		}

		return mapResultRow(fields!, rows[0], joinsNotNullableMap);
	}

	values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.bind(...params).raw();
	}
}
