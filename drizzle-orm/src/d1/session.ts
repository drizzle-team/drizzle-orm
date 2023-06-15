/// <reference types="@cloudflare/workers-types" />

import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations';
import { type Query } from '~/sql';
import { fillPlaceholders } from '~/sql';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types';
import {
	Batch,
	type PreparedQueryConfig as PreparedQueryConfigBase,
} from '~/sqlite-core/session';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session';
import { mapResultRow } from '~/utils';

export interface SQLiteD1SessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class D1Batch extends Batch<D1Database, D1PreparedStatement> {
	private client: D1Database | null = null;
	private statements: { statement: D1PreparedStatement, resolve: (reason?: unknown) => void, reject: (error: unknown) => void}[] = [];
	private ran = false;

	async registerQuery(client: D1Database, preparedStatement: D1PreparedStatement): Promise<unknown> {
		if (this.ran) throw new Error('Cannot register a query after `run()` has been called.');

		if (!this.client) {
			this.client = client;
		} else if (this.client !== client) {
			throw new Error('All statements in a batch must use the same client.');
		}

		let resolve!: (value: unknown) => void;
		let reject!: (reason?: unknown) => void;

		const promise = new Promise((_resolve, _reject) => {
			resolve = _resolve;
			reject = _reject;
		})
		
		this.statements.push({ statement: preparedStatement, resolve, reject });
		return promise;
	}

	async run(): Promise<void> {
		if (this.ran) return;
		this.ran = true;

		if (!this.client) return;

		try {
			const d1Results = await this.client.batch(this.statements.map(({ statement }) => statement));
			for (let i = 0; i < this.statements.length; i++) {
				const statement = this.statements[i]!;
				const d1Result = d1Results[i]!;

				statement.resolve(d1Result.results!);
			}
		} catch (e) {
			for (const { reject } of this.statements) {
				reject(e);
			}
		}
	}
}

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
		return new PreparedQuery(this.client, stmt, query.sql, query.params, this.logger, fields, customResultMapper);
	}

	override async transaction(): Promise<never> {
		throw new Error('Native transactions are not supported on D1. See the `batch` api.');
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'async'; run: D1Result; runBatch: T['runBatch']; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private client: D1Database,
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
		return this.getPreparedStatement(placeholderValues).run();
	}

	override runInBatch(batch: D1Batch, placeholderValues?: Record<string, unknown>): Promise<T['runBatch']> {
		return batch.registerQuery(this.client, this.getPreparedStatement(placeholderValues)) as unknown as Promise<T['runBatch']>;
	}

	private getPreparedStatement(placeholderValues?: Record<string, unknown>) {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.bind(...params);
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
