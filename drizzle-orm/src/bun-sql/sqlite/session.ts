/// <reference types="bun-types" />

import type { SavepointSQL, SQL as BunSQL, TransactionSQL } from 'bun';
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
import { fillPlaceholders, type Query, type SQL } from '~/sql/sql.ts';
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
import { makeJitQueryMapper, mapResultRow, type RowsMapper } from '~/utils.ts';

export interface BunSQLiteSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMappers?: boolean;
}

export type BunSQLiteRunResult = Record<string, unknown>[] & Record<string, unknown>;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class BunSQLiteSession<
	TSQL extends BunSQL,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'async', BunSQLiteRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'BunSQLiteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		readonly client: TSQL,
		dialect: SQLiteAsyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		readonly options: BunSQLiteSessionOptions,
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
	): BunSQLitePreparedQuery<T> {
		return new BunSQLitePreparedQuery(
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
	): BunSQLitePreparedQuery<T, true> {
		return new BunSQLitePreparedQuery(
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

	override async run(query: SQL): Result<'async', BunSQLiteRunResult> {
		const staticQuery = this.dialect.sqlToQuery(query);
		try {
			return await this.prepareOneTimeQuery(staticQuery, undefined, 'run').run() as Result<
				'async',
				BunSQLiteRunResult
			>;
		} catch (err) {
			throw new DrizzleError({ cause: err, message: `Failed to run the query '${staticQuery.sql}'` });
		}
	}

	override async transaction<T>(
		transaction: (db: BunSQLiteTransaction<TFullSchema, TRelations, TSchema>) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		return this.client.begin(config?.behavior ?? '', async (client) => {
			const session = new BunSQLiteSession<SavepointSQL, TFullSchema, TRelations, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			);
			const tx = new BunSQLiteTransaction<TFullSchema, TRelations, TSchema>(
				'async',
				this.dialect,
				session,
				this.relations,
				this.schema,
			);

			return await transaction(tx);
		}) as Promise<T>;
	}
}

export class BunSQLiteTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'async', BunSQLiteRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'BunSQLiteTransaction';

	override async transaction<T>(
		transaction: (tx: BunSQLiteTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		return (<BunSQLiteSession<TransactionSQL, any, any, any>> <unknown> this.session).client.savepoint(
			async (client) => {
				const session = new BunSQLiteSession<SavepointSQL, TFullSchema, TRelations, TSchema>(
					client,
					this.session.dialect,
					this.relations,
					this.schema,
					(<BunSQLiteSession<TransactionSQL, any, any, any>> <unknown> this.session).options,
				);
				const tx = new BunSQLiteTransaction(
					'async',
					this.dialect,
					session,
					this.relations,
					this.schema,
					this.nestedIndex + 1,
				);
				return await transaction(tx);
			},
		);
	}
}

export class BunSQLitePreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends SQLitePreparedQuery<
	{
		type: 'async';
		run: BunSQLiteRunResult;
		all: T['all'];
		get: T['get'];
		values: T['values'];
		execute: T['execute'];
	}
> {
	static override readonly [entityKind]: string = 'BunSQLitePreparedQuery';
	private jitMapper?: RowsMapper | RelationalRowsMapper;

	constructor(
		private client: BunSQL,
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

	async run(placeholderValues: Record<string, unknown> = {}): Promise<BunSQLiteRunResult> {
		const { logger, query, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(query.sql, params);

		return await this.queryWithCache(query.sql, params, async () => {
			return await client.unsafe(query.sql, params);
		});
	}

	async all(placeholderValues: Record<string, unknown> = {}): Promise<T['all']> {
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);
		const { logger, query, fields, joinsNotNullableMap, customResultMapper, client } = this;

		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues);
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				const res = await client.unsafe(query.sql, params);
				return res;
			});
		}

		const rows = await this.values(placeholderValues) as unknown[][];

		if (customResultMapper) {
			return (customResultMapper as (
				rows: unknown[][],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)(rows);
		}

		return this.useJitMappers
			? (this.jitMapper = this.jitMapper as RowsMapper
				?? makeJitQueryMapper<T['execute']>(fields!, joinsNotNullableMap))(rows)
			: rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	private async allRqbV2(placeholderValues: Record<string, unknown> = {}): Promise<T['all']> {
		const { logger, query, customResultMapper, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(query.sql, params);

		const rows = await client.unsafe(query.sql, params);

		return this.useJitMappers
			? (this.jitMapper = this.jitMapper as RelationalRowsMapper<T['all']>
				?? makeJitRqbMapper<T['all']>(this.rqbConfig!))(rows)
			: (customResultMapper as (
				rows: Record<string, unknown>[],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)(rows);
	}

	async get(placeholderValues: Record<string, unknown> = {}): Promise<T['get']> {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);

		const { logger, query, fields, joinsNotNullableMap, customResultMapper, client } = this;

		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues);
			logger.logQuery(query.sql, params);
			return await this.queryWithCache(query.sql, params, async () => {
				const rows = await client.unsafe(query.sql, params);
				return rows[0];
			});
		}

		const rows = await this.values(placeholderValues) as unknown[][];
		const row = rows[0];

		if (customResultMapper) {
			return (customResultMapper as (
				rows: unknown[][],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)(rows);
		}

		if (row === undefined) return row;
		return this.useJitMappers
			? (this.jitMapper = this.jitMapper as RowsMapper
				?? makeJitQueryMapper<T['execute']>(fields!, joinsNotNullableMap))(
					[row],
				)[0]
			: mapResultRow(fields!, row, joinsNotNullableMap);
	}

	private async getRqbV2(placeholderValues: Record<string, unknown> = {}) {
		const { logger, query, customResultMapper, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues);

		logger.logQuery(query.sql, params);
		const rows = await client.unsafe(query.sql, params);
		const row = rows[0];

		if (row === undefined) return row;

		return this.useJitMappers
			? (this.jitMapper = this.jitMapper as RelationalRowsMapper<T['get'][]>
				?? makeJitRqbMapper<T['get'][]>(this.rqbConfig!))(rows)
			: (customResultMapper as (
				rows: Record<string, unknown>[],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)([row]);
	}

	async values(placeholderValues: Record<string, unknown> = {}): Promise<T['values']> {
		const {
			client,
			logger,
			query,
		} = this;
		const params = fillPlaceholders(query.params, placeholderValues);

		logger.logQuery(query.sql, params);
		return await this.queryWithCache(query.sql, params, async () => {
			return await client.unsafe(query.sql, params).values();
		});
	}
}
