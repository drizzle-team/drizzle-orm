import type { BatchItem, BatchResponse } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import {
	SQLiteAsyncPreparedQuery,
	type SQLiteAsyncPreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteAsyncSession,
	SQLiteAsyncTransaction,
	type SQLiteQueryExecutors,
} from '~/sqlite-core/async/session.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteExecuteMethod, SQLiteTransactionConfig } from '~/sqlite-core/session.ts';
import type { SqliteProxyBatchItem, SqliteProxyExecutors, SqliteRemoteRunResult } from './driver.ts';

export interface SQLiteRemoteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteRemoteSession<
	TRelations extends AnyRelations,
> extends SQLiteAsyncSession<'async', SqliteRemoteRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteRemoteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: SqliteProxyExecutors,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: SQLiteRemoteSessionOptions = {},
	) {
		super(dialect, 'async');
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		_prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): SQLiteAsyncPreparedQuery<T & { run: SqliteRemoteRunResult }> {
		const executors: SQLiteQueryExecutors<'async'> = {
			all: (params) => this.client.all(query.sql, params, mode === 'arrays' ? 'array' : 'object'),
			get: (params) => this.client.get(query.sql, params, mode === 'arrays' ? 'array' : 'object'),
			run: (params) => this.client.run(query.sql, params),
		};
		return new SQLiteAsyncPreparedQuery(
			'async',
			executeMethod,
			executors,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		);
	}

	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T): Promise<BatchResponse<T>> {
		if (!this.client.batch) throw new Error('You must provide "batch" handler to proxy executors to use "batch"');

		const preparedQueries: SQLiteAsyncPreparedQuery<any>[] = [];
		const builtQueries: SqliteProxyBatchItem[] = [];

		for (const query of queries) {
			const preparedQuery = query._prepare() as SQLiteAsyncPreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push({
				sql: builtQuery.sql,
				params: builtQuery.params,
				method: preparedQuery.executeMethod === 'values' ? 'all' : preparedQuery.executeMethod,
				rowMode: preparedQuery.mode === 'raw' ? undefined : preparedQuery.mode.slice(0, -1),
			} as SqliteProxyBatchItem);
		}

		const batchResults = await (this.client.batch)(builtQueries);
		return batchResults.map((result, i) => {
			const { executeMethod, mapper } = preparedQueries[i]!;

			if (executeMethod === 'get') {
				if (!result) return;
				if (!mapper) return result;

				return mapper([result])[0];
			}

			if (!mapper) return result;
			return mapper(result);
		}) as BatchResponse<T>;
	}

	override async transaction<T>(
		transaction: (tx: SQLiteProxyTransaction<TRelations>) => Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		if (config?.behavior === 'concurrent') throw new Error('Concurrent transactions are not supported by driver');

		const tx = new SQLiteProxyTransaction('async', this.dialect, this, this.relations);
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

export class SQLiteProxyTransaction<TRelations extends AnyRelations>
	extends SQLiteAsyncTransaction<'async', SqliteRemoteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLiteProxyTransaction';

	override async transaction<T>(
		transaction: (tx: SQLiteProxyTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new SQLiteProxyTransaction(
			'async',
			this.dialect,
			this.session,
			this._.relations,
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
