import type { BatchItem, BatchResponse } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteExecuteMethod,
	SQLiteQueryExecutors,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import type { AsyncBatchRemoteCallback, RemoteCallback, SqliteRemoteResult } from './driver.ts';

export interface SQLiteRemoteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteRemoteSession<
	TRelations extends AnyRelations,
> extends SQLiteSession<'async', SqliteRemoteResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteRemoteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: RemoteCallback,
		dialect: SQLiteAsyncDialect,
		private relations: TRelations,
		private batchClient?: AsyncBatchRemoteCallback,
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
	): SQLitePreparedQuery<T & { run: SqliteRemoteResult }> {
		// TODO: client doesn't support object mode querying - revisit api
		const executors: SQLiteQueryExecutors<'async'> = {
			all: (params) => this.client(query.sql, params, 'all'),
			get: (params) => this.client(query.sql, params, 'get'),
			run: (params) => this.client(query.sql, params, 'run'),
			values: (params) => this.client(query.sql, params, 'all'),
		};
		return new SQLitePreparedQuery(
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

	override objects<T = unknown>(_query: SQL): Promise<T[]> {
		throw new Error("Proxy driver doesn't support object-mode querying");
	}

	override object<T = unknown>(_query: SQL): Promise<T> {
		throw new Error("Proxy driver doesn't support object-mode querying");
	}

	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T): Promise<BatchResponse<T>> {
		const preparedQueries: SQLitePreparedQuery<any>[] = [];
		const builtQueries: { sql: string; params: any[]; method: SQLiteExecuteMethod }[] = [];

		for (const query of queries) {
			const preparedQuery = query._prepare() as SQLitePreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push({ sql: builtQuery.sql, params: builtQuery.params, method: preparedQuery.executeMethod });
		}

		const batchResults = await (this.batchClient as AsyncBatchRemoteCallback)(builtQueries);
		return batchResults.map((result, i) => {
			const { executeMethod, mapper } = preparedQueries[i]!;

			if (executeMethod === 'run' || executeMethod === 'values') return result;

			const { rows } = result;
			if (executeMethod === 'get') {
				if (!rows) return;
				if (!mapper) return rows;

				return mapper([rows])[0];
			}

			if (!mapper) return rows;

			return mapper(rows);
		}) as BatchResponse<T>;
	}

	override async transaction<T>(
		transaction: (tx: SQLiteProxyTransaction<TRelations>) => Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new SQLiteProxyTransaction('async', this.dialect, this, this.relations, undefined, true);
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
	extends SQLiteTransaction<'async', SqliteRemoteResult, TRelations>
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
