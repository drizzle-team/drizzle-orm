/// <reference types="@cloudflare/workers-types" />

import type { BatchItem } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteExecuteMethod,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface SQLiteD1SessionOptions {
	logger?: Logger;
	cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteD1Session<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', D1Result, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'SQLiteD1Session';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: D1Database,
		dialect: SQLiteAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: SQLiteD1SessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => unknown,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): D1PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return new D1PreparedQuery(
			stmt,
			query,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			executeMethod,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T) {
		const preparedQueries: PreparedQuery[] = [];
		const builtQueries: D1PreparedStatement[] = [];

		for (const query of queries) {
			const preparedQuery = query._prepare();
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			if (builtQuery.params.length > 0) {
				builtQueries.push((preparedQuery as D1PreparedQuery).stmt.bind(...builtQuery.params));
			} else {
				const builtQuery = preparedQuery.getQuery();
				builtQueries.push(
					this.client.prepare(builtQuery.sql).bind(...builtQuery.params),
				);
			}
		}

		const batchResults = await this.client.batch<any>(builtQueries);
		return batchResults.map((result, i) => preparedQueries[i]!.mapResult(result, true));
	}

	override extractRawAllValueFromBatchResult(result: unknown): unknown {
		return (result as D1Result).results;
	}

	override extractRawGetValueFromBatchResult(result: unknown): unknown {
		return (result as D1Result).results[0];
	}

	override extractRawValuesValueFromBatchResult(result: unknown): unknown {
		return d1ToRawMapping((result as D1Result).results);
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
	static override readonly [entityKind]: string = 'D1Transaction';

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

/**
 * This function was taken from the D1 implementation: https://github.com/cloudflare/workerd/blob/4aae9f4c7ae30a59a88ca868c4aff88bda85c956/src/cloudflare/internal/d1-api.ts#L287
 * It may cause issues with duplicated column names in join queries, which should be fixed on the D1 side.
 * @param results
 * @returns
 */
function d1ToRawMapping(results: any) {
	const rows: unknown[][] = [];
	for (const row of results) {
		const entry = Object.keys(row).map((k) => row[k]);
		rows.push(entry);
	}
	return rows;
}

export class D1PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<
	{ type: 'async'; run: D1Response; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'D1PreparedQuery';

	/** @internal */
	customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown;

	/** @internal */
	fields?: SelectedFieldsOrdered;

	/** @internal */
	stmt: D1PreparedStatement;

	constructor(
		stmt: D1PreparedStatement,
		query: Query,
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super('async', executeMethod, query, cache, queryMetadata, cacheConfig);
		this.customResultMapper = customResultMapper;
		this.fields = fields;
		this.stmt = stmt;
	}

	async run(placeholderValues?: Record<string, unknown>): Promise<D1Response> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return await this.queryWithCache(this.query.sql, params, async () => {
			return this.stmt.bind(...params).run();
		});
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, query, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				return stmt.bind(...params).all().then(({ results }) => this.mapAllResult(results!));
			});
		}

		const rows = await this.values(placeholderValues);

		return this.mapAllResult(rows);
	}

	override mapAllResult(rows: unknown, isFromBatch?: boolean): unknown {
		if (isFromBatch) {
			rows = d1ToRawMapping((rows as D1Result).results);
		}

		if (!this.fields && !this.customResultMapper) {
			return rows;
		}

		if (this.customResultMapper) {
			return this.customResultMapper(rows as unknown[][]);
		}

		return (rows as unknown[][]).map((row) => mapResultRow(this.fields!, row, this.joinsNotNullableMap));
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				return stmt.bind(...params).all().then(({ results }) => results![0]);
			});
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

	override mapGetResult(result: unknown, isFromBatch?: boolean): unknown {
		if (isFromBatch) {
			result = d1ToRawMapping((result as D1Result).results)[0];
		}

		if (!this.fields && !this.customResultMapper) {
			return result;
		}

		if (this.customResultMapper) {
			return this.customResultMapper([result as unknown[]]) as T['all'];
		}

		return mapResultRow(this.fields!, result as unknown[], this.joinsNotNullableMap);
	}

	async values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return await this.queryWithCache(this.query.sql, params, async () => {
			return this.stmt.bind(...params).raw();
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
