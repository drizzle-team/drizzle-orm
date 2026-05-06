import type { DatabasePromise, StatementPromise } from '@tursodatabase/database-common';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import {
	type AnyRelations,
	makeJitRqbMapper,
	type RelationalQueryMapperConfig,
	type RelationalRowsMapper,
} from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	Result,
	SQLiteExecuteMethod,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { makeJitQueryMapper, mapResultRow, type RowsMapper } from '~/utils.ts';
import type { TursoDatabaseRunResult } from './driver-core.ts';

export interface TursoDatabaseSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMappers?: boolean;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class TursoDatabaseSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'async', TursoDatabaseRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'TursoDatabaseSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: DatabasePromise,
		dialect: SQLiteAsyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: TursoDatabaseSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper?: (rows: unknown[][]) => unknown,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): TursoDatabasePreparedQuery<T> {
		return new TursoDatabasePreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			executeMethod,
			this.options.useJitMappers,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[]) => unknown,
		config: RelationalQueryMapperConfig,
	): TursoDatabasePreparedQuery<T, true> {
		return new TursoDatabasePreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			executeMethod,
			this.options.useJitMappers,
			customResultMapper,
			true,
			config,
		);
	}

	override async transaction<T>(
		transaction: (db: TursoDatabaseTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const session = new TursoDatabaseSession<TFullSchema, TRelations, TSchema>(
			this.client,
			this.dialect,
			this.relations,
			this.schema,
			this.options,
		);
		const localTx = new TursoDatabaseTransaction<TFullSchema, TRelations, TSchema>(
			'async',
			this.dialect,
			session,
			this.relations,
			this.schema,
		);

		const clientTx = this.client.transaction(async () => await transaction(localTx));

		const result = await clientTx();
		return result;
	}

	override async run(query: SQL): Result<'async', TursoDatabaseRunResult> {
		const staticQuery = this.dialect.sqlToQuery(query);

		return this.prepareOneTimeQuery(staticQuery, undefined, 'run').run().catch((err) => {
			throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
		}) as Result<
			'async',
			TursoDatabaseRunResult
		>;
	}

	override async all<T = unknown>(query: SQL): Result<'async', T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run').all() as Result<
			'async',
			T[]
		>;
	}

	override async get<T = unknown>(query: SQL): Result<'async', T> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run').get() as Result<
			'async',
			T
		>;
	}

	override async values<T extends any[] = unknown[]>(
		query: SQL,
	): Result<'async', T[]> {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), undefined, 'run').values() as Result<
			'async',
			T[]
		>;
	}
}

export class TursoDatabaseTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'async', TursoDatabaseRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'TursoDatabaseTransaction';

	override async transaction<T>(
		transaction: (tx: TursoDatabaseTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;

		const tx = new TursoDatabaseTransaction(
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

export class TursoDatabasePreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends SQLitePreparedQuery<
	{
		type: 'async';
		run: TursoDatabaseRunResult;
		all: T['all'];
		get: T['get'];
		values: T['values'];
		execute: T['execute'];
	}
> {
	static override readonly [entityKind]: string = 'TursoDatabasePreparedQuery';
	private jitMapper?: RowsMapper<any> | RelationalRowsMapper<any>;
	private stmt?: StatementPromise;

	constructor(
		private client: DatabasePromise,
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
		private useJitMappers: boolean | undefined,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown,
		private isRqbV2Query?: TIsRqbV2,
		private rqbConfig?: RelationalQueryMapperConfig,
	) {
		super('async', executeMethod, query, cache, queryMetadata, cacheConfig);
	}

	async run(placeholderValues?: Record<string, unknown>): Promise<TursoDatabaseRunResult> {
		const { query, logger } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);
		return this.queryWithCache(query.sql, params, async () => {
			this.stmt ??= await this.client.prepare(query.sql);
			return (params.length ? this.stmt.run(...params) : this.stmt.run());
		});
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);

		const { fields, logger, query, customResultMapper, joinsNotNullableMap } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return this.queryWithCache(query.sql, params, async () => {
				this.stmt ??= await this.client.prepare(query.sql);
				return (params.length ? this.stmt.raw(false).all(...params) : this.stmt.raw(false).all());
			});
		}

		const rows = await this.values(placeholderValues) as unknown[][];

		return this.useJitMappers
			? (this.jitMapper = this.jitMapper as RowsMapper<T['all']>
				?? makeJitQueryMapper<T['all']>(fields!, joinsNotNullableMap))(rows)
			: rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	private async allRqbV2(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { logger, query, customResultMapper } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const rows = await this.queryWithCache(query.sql, params, async () => {
			this.stmt ??= await this.client.prepare(query.sql);
			return (params.length ? this.stmt.raw(false).all(...params) : this.stmt.raw(false).all());
		});

		return this.useJitMappers
			? (this.jitMapper = this.jitMapper as RelationalRowsMapper<T['all']>
				?? makeJitRqbMapper<T['all']>(this.rqbConfig!))(rows)
			: (customResultMapper as (
				rows: Record<string, unknown>[],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)(rows as Record<string, unknown>[]) as T['all'];
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);

		const { fields, logger, query, customResultMapper, joinsNotNullableMap } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});

		if (!fields && !customResultMapper) {
			logger.logQuery(query.sql, params);
			return this.queryWithCache(query.sql, params, async () => {
				this.stmt ??= await this.client.prepare(query.sql);
				return (params.length ? this.stmt.raw(false).get(...params) : this.stmt.raw(false).get());
			});
		}

		const row = await this.queryWithCache(query.sql, params, async () => {
			this.stmt ??= await this.client.prepare(query.sql);
			return (params.length ? this.stmt.raw(true).get(...params) : this.stmt.raw(true).get());
		});

		if (row === undefined) return row;

		return this.useJitMappers
			? (this.jitMapper = this.jitMapper as RowsMapper<T['get'][]>
				?? makeJitQueryMapper<T['get'][]>(fields!, joinsNotNullableMap))(
					[row],
				)[0]
			: mapResultRow(fields!, row, joinsNotNullableMap);
	}

	private async getRqbV2(placeholderValues?: Record<string, unknown>) {
		const { logger, query, customResultMapper } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const row = await this.queryWithCache(query.sql, params, async () => {
			this.stmt ??= await this.client.prepare(query.sql);
			return (params.length ? this.stmt.raw(false).get(...params) : this.stmt.raw(false).get());
		});

		if (row === undefined) return row;

		return this.useJitMappers
			? (this.jitMapper = this.jitMapper as RelationalRowsMapper<T['get'][]>
				?? makeJitRqbMapper<T['get'][]>(this.rqbConfig!))([row])
			: (customResultMapper as (
				rows: Record<string, unknown>[],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)([row] as Record<string, unknown>[]) as T['get'];
	}

	async values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const { logger, query } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);
		return this.queryWithCache(query.sql, params, async () => {
			this.stmt ??= await this.client.prepare(query.sql);
			return (params.length ? this.stmt.raw(true).all(...params) : this.stmt.raw(true).all());
		});
	}
}
