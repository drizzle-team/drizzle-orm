import type { Database, SQLiteCloudRow, SQLiteCloudRowset } from '@sqlitecloud/drivers';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	Result,
	SQLiteExecuteMethod,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';
import type { SQLiteCloudRunResult } from './driver.ts';

export interface SQLiteCloudSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteCloudSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'async', SQLiteCloudRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SQLiteCloudSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: Database,
		dialect: SQLiteAsyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: SQLiteCloudSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
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
	): SQLiteCloudPreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);

		return new SQLiteCloudPreparedQuery(
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

	prepareRelationalQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[]) => unknown,
	): SQLiteCloudPreparedQuery<T, true> {
		const stmt = this.client.prepare(query.sql);

		return new SQLiteCloudPreparedQuery(
			stmt,
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

	override async run(query: SQL): Result<'async', SQLiteCloudRunResult> {
		const staticQuery = this.dialect.sqlToQuery(query);
		try {
			return await this.prepareOneTimeQuery(staticQuery, undefined, 'run', false).run() as Result<
				'async',
				SQLiteCloudRunResult
			>;
		} catch (err) {
			throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
		}
	}

	override async all<T = unknown>(query: SQL): Result<'async', T[]> {
		return await this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).all() as Result<
			'async',
			T[]
		>;
	}

	override async get<T = unknown>(query: SQL): Result<'async', T> {
		return await this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).get() as Result<
			'async',
			T
		>;
	}

	override async values<T extends any[] = unknown[]>(
		query: SQL,
	): Result<'async', T[]> {
		return await this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run', false).values() as Result<
			'async',
			T[]
		>;
	}

	override async transaction<T>(
		transaction: (
			tx: SQLiteCloudTransaction<TFullSchema, TRelations, TSchema>,
		) => Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new SQLiteCloudTransaction(
			'async',
			this.dialect,
			this,
			this.relations,
			this.schema,
		);
		await tx.run(sql`BEGIN${sql` ${sql.raw(config?.behavior ?? '')}`.if(config?.behavior)} TRANSACTION`);

		try {
			const result = await transaction(tx);
			await tx.run(sql`COMMIT`);
			return result;
		} catch (err) {
			await tx.run(sql`ROLLBACK`);
			throw err;
		}
	}
}

export class SQLiteCloudTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'async', SQLiteCloudRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SQLiteCloudTransaction';

	override async transaction<T>(
		transaction: (tx: SQLiteCloudTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new SQLiteCloudTransaction(
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

export class SQLiteCloudPreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends SQLitePreparedQuery<
	{
		type: 'async';
		run: SQLiteCloudRunResult;
		all: T['all'];
		get: T['get'];
		values: T['values'];
		execute: T['execute'];
	}
> {
	static override readonly [entityKind]: string = 'SQLiteCloudPreparedQuery';

	constructor(
		private stmt: ReturnType<Database['prepare']>,
		query: Query,
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		/** @internal */ public fields: SelectedFieldsOrdered | undefined,
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

	async run(placeholderValues?: Record<string, unknown>): Promise<SQLiteCloudRunResult> {
		const { stmt, query, logger } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);
		return await this.queryWithCache(query.sql, params, async () => {
			return await new Promise<any>((resolve, reject) => {
				(params.length ? stmt.bind(...params) : stmt).run((e: Error | null, d: SQLiteCloudRowset) => {
					if (e) return reject(e);

					return resolve(d);
				});
			});
		});
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		if (this.isRqbV2Query) return await this.allRqbV2(placeholderValues);

		const { fields, logger, query, customResultMapper, joinsNotNullableMap, stmt } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				return await new Promise<any>((resolve, reject) => {
					(params.length ? stmt.bind(...params) : stmt).all((e: Error | null, d: SQLiteCloudRowset) => {
						if (e) return reject(e);

						return resolve(d.map((v) => Object.fromEntries(Object.entries(v))));
					});
				});
			});
		}

		const rows = await this.values(placeholderValues) as unknown[][];

		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	private async allRqbV2(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { logger, query, customResultMapper, stmt } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const rows = await new Promise<any>((resolve, reject) => {
			(params.length ? stmt.bind(...params) : stmt).all((e: Error | null, d: SQLiteCloudRowset) => {
				if (e) return reject(e);

				return resolve(d.map((v) => Object.fromEntries(Object.entries(v))));
			});
		});

		return (customResultMapper as (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown)(rows as Record<string, unknown>[]) as T['all'];
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		if (this.isRqbV2Query) return await this.getRqbV2(placeholderValues);

		const { fields, logger, query, stmt, customResultMapper, joinsNotNullableMap } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		if (!fields && !customResultMapper) {
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				return await new Promise<any>((resolve, reject) => {
					(params.length ? stmt.bind(...params) : stmt).get((e: Error | null, d: SQLiteCloudRow | undefined) => {
						if (e) return reject(e);

						return resolve(d ? Object.fromEntries(Object.entries(d)) : d);
					});
				});
			});
		}

		const row = await this.queryWithCache(query.sql, params, async () => {
			return await new Promise<any>((resolve, reject) => {
				(params.length ? stmt.bind(...params) : stmt).get((e: Error | null, d: SQLiteCloudRow | undefined) => {
					if (e) return reject(e);

					return resolve(d ? d.getData() : d);
				});
			});
		});

		if (row === undefined) return row;

		return mapResultRow(fields!, row, joinsNotNullableMap);
	}

	private async getRqbV2(placeholderValues?: Record<string, unknown>) {
		const { logger, query, stmt, customResultMapper } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const row = await new Promise<any>((resolve, reject) => {
			(params.length ? stmt.bind(...params) : stmt).get((e: Error | null, d: SQLiteCloudRow | undefined) => {
				if (e) return reject(e);

				return resolve(d ? Object.fromEntries(Object.entries(d)) : d);
			});
		});

		if (row === undefined) return row;

		return (customResultMapper as (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown)([row] as Record<string, unknown>[]) as T['get'];
	}

	async values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const { logger, stmt, query } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);
		return await this.queryWithCache(query.sql, params, async () => {
			return await new Promise<any>((resolve, reject) => {
				(params.length ? stmt.bind(...params) : stmt).all((e: Error | null, d: SQLiteCloudRowset) => {
					if (e) return reject(e);

					return (resolve(d.map((v) => v.getData())));
				});
			});
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
