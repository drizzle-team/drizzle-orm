import type { Database, Primitive } from 'db0';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
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

export interface Db0SQLiteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export type Db0RunResult = { success: boolean };

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class Db0SQLiteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', Db0RunResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'Db0SQLiteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: Database,
		dialect: SQLiteAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: Db0SQLiteSessionOptions = {},
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
		queryMetadata?: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] },
		cacheConfig?: WithCacheConfig,
	): Db0SQLitePreparedQuery {
		return new Db0SQLitePreparedQuery(
			this.client,
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

	override async transaction<T>(
		transaction: (tx: Db0SQLiteTransaction<TFullSchema, TSchema>) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new Db0SQLiteTransaction('async', this.dialect, this, this.schema);
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

export class Db0SQLiteTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'async', Db0RunResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'Db0SQLiteTransaction';

	override async transaction<T>(
		transaction: (tx: Db0SQLiteTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new Db0SQLiteTransaction('async', this.dialect, this.session, this.schema, this.nestedIndex + 1);
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

export class Db0SQLitePreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<
	{ type: 'async'; run: Db0RunResult; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'Db0SQLitePreparedQuery';

	/** @internal */
	customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown;

	/** @internal */
	fields?: SelectedFieldsOrdered;

	constructor(
		private client: Database,
		query: Query,
		private logger: Logger,
		cache: Cache,
		queryMetadata: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] } | undefined,
		cacheConfig: WithCacheConfig | undefined,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super('async', executeMethod, query, cache, queryMetadata, cacheConfig);
		this.customResultMapper = customResultMapper;
		this.fields = fields;
	}

	async run(placeholderValues?: Record<string, unknown>): Promise<Db0RunResult> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {}) as Primitive[];
		this.logger.logQuery(this.query.sql, params);
		return await this.queryWithCache(this.query.sql, params, async () => {
			const stmt = this.client.prepare(this.query.sql);
			return stmt.run(...params) as Promise<Db0RunResult>;
		});
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, query, logger, client, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {}) as Primitive[];
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				const stmt = client.prepare(query.sql);
				return stmt.all(...params) as Promise<T['all']>;
			});
		}

		const rows = await this.values(placeholderValues);
		return this.mapAllResult(rows);
	}

	override mapAllResult(rows: unknown): unknown {
		if (!this.fields && !this.customResultMapper) {
			return rows;
		}

		if (this.customResultMapper) {
			return this.customResultMapper(rows as unknown[][]);
		}

		return (rows as unknown[][]).map((row) => mapResultRow(this.fields!, row, this.joinsNotNullableMap));
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields, query, logger, client, customResultMapper, joinsNotNullableMap } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {}) as Primitive[];
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				const stmt = client.prepare(query.sql);
				return stmt.get(...params) as Promise<T['get']>;
			});
		}

		const rows = await this.values(placeholderValues);

		if (!rows[0]) {
			return undefined;
		}

		if (customResultMapper) {
			return customResultMapper(rows) as T['all'];
		}

		return mapResultRow(fields!, rows[0] as unknown[], joinsNotNullableMap);
	}

	async values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {}) as Primitive[];
		this.logger.logQuery(this.query.sql, params);
		return await this.queryWithCache(this.query.sql, params, async () => {
			const stmt = this.client.prepare(this.query.sql);
			// db0 doesn't have a raw/values method, so we need to get all and convert to arrays
			const rows = await stmt.all(...params) as Record<string, unknown>[];
			return rows.map((row) => Object.values(row)) as T[];
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
