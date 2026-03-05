import type * as V1 from '~/_relations.ts';
import type { BatchItem } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import {
	type AnyRelations,
	makeRqbJitMapper,
	type RelationalQueryJitMapper,
	type RelationalQueryMapperConfig,
} from '~/relations.ts';
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
import { type JitMapper, makeJitQueryMapper, mapResultRow } from '~/utils.ts';
import type { AsyncBatchRemoteCallback, AsyncRemoteCallback, RemoteCallback, SqliteRemoteResult } from './driver.ts';

export interface SQLiteRemoteSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'async', SqliteRemoteResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SQLiteRemoteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: RemoteCallback,
		dialect: SQLiteAsyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private batchCLient?: AsyncBatchRemoteCallback,
		private options: SQLiteRemoteSessionOptions = {},
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
	): RemotePreparedQuery<T> {
		return new RemotePreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			executeMethod,
			isResponseInArrayMode,
			this.options.useJitMapper,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[]) => unknown,
		config: RelationalQueryMapperConfig,
	): RemotePreparedQuery<T, true> {
		return new RemotePreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			executeMethod,
			true,
			this.options.useJitMapper,
			customResultMapper,
			true,
			config,
		);
	}

	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T) {
		const preparedQueries: PreparedQuery[] = [];
		const builtQueries: { sql: string; params: any[]; method: 'run' | 'all' | 'values' | 'get' }[] = [];

		for (const query of queries) {
			const preparedQuery = query._prepare();
			const builtQuery = (preparedQuery as RemotePreparedQuery).getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push({ sql: builtQuery.sql, params: builtQuery.params, method: builtQuery.method });
		}

		const batchResults = await (this.batchCLient as AsyncBatchRemoteCallback)(builtQueries);
		return batchResults.map((result, i) => preparedQueries[i]!.mapResult(result, true));
	}

	override async transaction<T>(
		transaction: (tx: SQLiteProxyTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new SQLiteProxyTransaction('async', this.dialect, this, this.relations, this.schema, undefined, true);
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

	override extractRawAllValueFromBatchResult(result: unknown): unknown {
		return (result as SqliteRemoteResult).rows;
	}

	override extractRawGetValueFromBatchResult(result: unknown): unknown {
		return (result as SqliteRemoteResult).rows![0];
	}

	override extractRawValuesValueFromBatchResult(result: unknown): unknown {
		return (result as SqliteRemoteResult).rows;
	}
}

export class SQLiteProxyTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'async', SqliteRemoteResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SQLiteProxyTransaction';

	override async transaction<T>(
		transaction: (tx: SQLiteProxyTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new SQLiteProxyTransaction(
			'async',
			this.dialect,
			this.session,
			this.relations,
			this.schema,
			this.nestedIndex + 1,
			true,
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

export class RemotePreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends SQLitePreparedQuery<
		{ type: 'async'; run: SqliteRemoteResult; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
	>
{
	static override readonly [entityKind]: string = 'SQLiteProxyPreparedQuery';

	private method: SQLiteExecuteMethod;
	private jitMapper?: JitMapper<any> | RelationalQueryJitMapper<any>;

	constructor(
		private client: RemoteCallback,
		query: Query,
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		private useJitMapper: boolean | undefined,
		/** @internal */ public customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => unknown,
		private isRqbV2Query?: TIsRqbV2,
		private rqbConfig?: RelationalQueryMapperConfig,
	) {
		super('async', executeMethod, query, cache, queryMetadata, cacheConfig);
		this.method = executeMethod;
	}

	override getQuery(): Query & { method: SQLiteExecuteMethod } {
		return { ...this.query, method: this.method };
	}

	async run(placeholderValues?: Record<string, unknown>): Promise<SqliteRemoteResult> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return await this.queryWithCache(this.query.sql, params, async () => {
			return await (this.client as AsyncRemoteCallback)(this.query.sql, params, 'run');
		});
	}

	override mapAllResult(rows: unknown, isFromBatch?: boolean): unknown {
		if (isFromBatch) {
			rows = (rows as SqliteRemoteResult).rows;
		}

		if (!this.fields && !this.customResultMapper) {
			return rows;
		}

		if (this.isRqbV2Query) {
			for (let i = 0; i < (rows as unknown[]).length; ++i) {
				(rows as unknown[])[i] = JSON.parse((rows as unknown[])[i] as string);
			}

			return this.useJitMapper
				? (this.jitMapper = this.jitMapper as RelationalQueryJitMapper<T['get'][]>
					?? makeRqbJitMapper<T['get'][]>(this.rqbConfig!))(rows as Record<string, unknown>[])
				: (this.customResultMapper as (
					rows: Record<string, unknown>[],
					mapColumnValue?: (value: unknown) => unknown,
				) => unknown)(rows as Record<string, unknown>[]);
		}

		if (this.customResultMapper) {
			return (this.customResultMapper as (rows: unknown[][]) => unknown)(rows as unknown[][]) as T['all'];
		}

		return this.useJitMapper
			? (this.jitMapper = this.jitMapper as JitMapper<T['execute']>
				?? makeJitQueryMapper(this.fields!, this.joinsNotNullableMap))(rows as unknown[][])
			: (rows as unknown[][]).map((row) => mapResultRow(this.fields!, row, this.joinsNotNullableMap));
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);

		const { query, logger, client } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const { rows } = await this.queryWithCache(query.sql, params, async () => {
			return await (client as AsyncRemoteCallback)(query.sql, params, 'all');
		});
		return this.mapAllResult(rows);
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);

		const { query, logger, client } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const clientResult = await this.queryWithCache(query.sql, params, async () => {
			return await (client as AsyncRemoteCallback)(query.sql, params, 'get');
		});

		return this.mapGetResult(clientResult.rows);
	}

	private async allRqbV2(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { query, logger, client } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const { rows } = await (client as AsyncRemoteCallback)(query.sql, params, 'all');
		return this.mapAllResult(rows);
	}

	private async getRqbV2(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { query, logger, client } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const { rows } = await (client as AsyncRemoteCallback)(query.sql, params, 'get');

		return this.mapGetResult(rows);
	}

	override mapGetResult(rows: unknown, isFromBatch?: boolean): unknown {
		if (isFromBatch) {
			rows = (rows as SqliteRemoteResult).rows;
		}

		const row = rows as unknown[] | string;

		if (!this.fields && !this.customResultMapper) {
			return row;
		}

		if (!row) {
			return undefined;
		}

		if (this.isRqbV2Query) {
			return this.useJitMapper
				? (this.jitMapper = this.jitMapper as RelationalQueryJitMapper<T['get'][]>
					?? makeRqbJitMapper<T['get'][]>(this.rqbConfig!))([JSON.parse(row as string) as Record<string, unknown>])
				: (this.customResultMapper as (
					rows: Record<string, unknown>[],
					mapColumnValue?: (value: unknown) => unknown,
				) => unknown)([JSON.parse(row as string) as Record<string, unknown>]);
		}

		if (this.customResultMapper) {
			return (this.customResultMapper as (rows: unknown[][]) => unknown)(
				[rows] as unknown[][],
			) as T['get'];
		}

		return this.useJitMapper
			? (this.jitMapper = this.jitMapper as JitMapper<T['get'][]>
				?? makeJitQueryMapper<T['get'][]>(this.fields!, this.joinsNotNullableMap))(
					[row as unknown[]],
				)[0]
			: mapResultRow(this.fields!, row as unknown[], this.joinsNotNullableMap);
	}

	async values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const clientResult = await this.queryWithCache(this.query.sql, params, async () => {
			return await (this.client as AsyncRemoteCallback)(this.query.sql, params, 'values');
		});
		return clientResult.rows as T[];
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
