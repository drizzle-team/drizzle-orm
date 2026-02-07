import type { Database, Primitive } from 'db0';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
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
import { mapDb0RowToArray } from '../_row-mapping.ts';

export interface Db0SQLiteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export type Db0RunResult = { success: boolean };

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class Db0SQLiteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'async', Db0RunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'Db0SQLiteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: Database,
		dialect: SQLiteAsyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
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
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
		queryMetadata?: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] },
		cacheConfig?: WithCacheConfig,
	): Db0SQLitePreparedQuery {
		return new Db0SQLitePreparedQuery(
			this.client,
			this.dialect,
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

	prepareRelationalQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[], mapColumnValue?: (value: unknown) => unknown) => unknown,
	): Db0SQLitePreparedQuery<PreparedQueryConfig, true> {
		return new Db0SQLitePreparedQuery(
			this.client,
			this.dialect,
			query,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			executeMethod,
			false,
			customResultMapper,
			true,
		);
	}

	override async transaction<T>(
		transaction: (tx: Db0SQLiteTransaction<TFullSchema, TRelations, TSchema>) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new Db0SQLiteTransaction('async', this.dialect, this, this.relations, this.schema);
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
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'async', Db0RunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'Db0SQLiteTransaction';

	override async transaction<T>(
		transaction: (tx: Db0SQLiteTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new Db0SQLiteTransaction(
			'async',
			this.dialect,
			this.session,
			this.relations,
			this.schema,
			this.nestedIndex + 1,
		);
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

export class Db0SQLitePreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends SQLitePreparedQuery<
	{ type: 'async'; run: Db0RunResult; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'Db0SQLitePreparedQuery';

	constructor(
		private client: Database,
		private dialect: SQLiteAsyncDialect,
		query: Query,
		private logger: Logger,
		cache: Cache,
		queryMetadata: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] } | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown,
		private isRqbV2Query?: TIsRqbV2,
	) {
		super('async', executeMethod, query, cache, queryMetadata, cacheConfig);
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
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);

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
		return this.mapAllResult(rows) as T['all'];
	}

	private async allRqbV2(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {}) as Primitive[];
		this.logger.logQuery(this.query.sql, params);

		const rows = await this.queryWithCache(this.query.sql, params, async () => {
			const stmt = this.client.prepare(this.query.sql);
			return await stmt.all(...params) as Record<string, unknown>[];
		});

		return (this.customResultMapper as (rows: Record<string, unknown>[]) => unknown)(rows) as T['all'];
	}

	override mapAllResult(rows: unknown): unknown {
		if (!this.fields && !this.customResultMapper) {
			return rows;
		}

		if (this.customResultMapper) {
			return (this.customResultMapper as (rows: unknown[][]) => unknown)(rows as unknown[][]);
		}

		return (rows as unknown[][]).map((row) => mapResultRow(this.fields!, row, this.joinsNotNullableMap));
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);

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
			return (customResultMapper as (rows: unknown[][]) => unknown)([rows[0] as unknown[]]) as T['get'];
		}

		return mapResultRow(fields!, rows[0] as unknown[], joinsNotNullableMap);
	}

	private async getRqbV2(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {}) as Primitive[];
		this.logger.logQuery(this.query.sql, params);

		const row = await this.queryWithCache(this.query.sql, params, async () => {
			const stmt = this.client.prepare(this.query.sql);
			return await stmt.get(...params) as Record<string, unknown> | undefined;
		});

		if (!row) return undefined;

		return (this.customResultMapper as (rows: Record<string, unknown>[]) => unknown)([row]) as T['get'];
	}

	async values<TValues extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<TValues[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {}) as Primitive[];
		this.logger.logQuery(this.query.sql, params);
		return await this.queryWithCache(this.query.sql, params, async () => {
			const stmt = this.client.prepare(this.query.sql);

			// db0's better-sqlite3 connector wraps a better-sqlite3 statement, which can return arrays via raw(true).
			// We prefer this for correctness with joins/aliases (object rows can lose duplicate column names).
			const rawStmtFactory = (stmt as any)?._statement;
			if (typeof rawStmtFactory === 'function') {
				const rawStmt = rawStmtFactory();
				if (rawStmt && typeof rawStmt.raw === 'function') {
					return rawStmt.raw(true).all(...(params as any[])) as TValues[];
				}
			}

			const rows = await stmt.all(...params) as Record<string, unknown>[];
			// db0 doesn't expose values/array mode in its public API, so fall back to mapping object rows.
			// For selections where db0 collapses duplicate column names, fail instead of returning wrong data.
			if (this.fields) {
				const mapped = rows.map((row) => mapDb0RowToArray(row, this.fields!, this.dialect));
				if (mapped.some((r) => r.length !== this.fields!.length)) {
					throw new Error(
						'db0 sqlite connector returned object rows with duplicate column names; use db0/connectors/better-sqlite3 for correct join/alias results.',
					);
				}
				return mapped as TValues[];
			}
			return rows.map((row) => Object.values(row)) as TValues[];
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
