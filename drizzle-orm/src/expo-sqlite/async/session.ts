import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
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

export interface ExpoSQLiteAsyncSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export type ExpoSQLiteAsyncRunResult = SQLiteRunResult;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class ExpoSQLiteAsyncSession<TRelations extends AnyRelations>
	extends SQLiteAsyncSession<'async', ExpoSQLiteAsyncRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'ExpoSQLiteAsyncSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: SQLiteDatabase,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: ExpoSQLiteAsyncSessionOptions = {},
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
	): SQLiteAsyncPreparedQuery<T & { run: ExpoSQLiteAsyncRunResult }> {
		const executors: SQLiteQueryExecutors<'async'> = {
			all: (params) =>
				this.client.prepareAsync(query.sql).then((stmt) => {
					const q = mode === 'arrays'
						? stmt.executeForRawResultAsync(params as any[])
						: stmt.executeAsync(params as any[]);

					return q.then((r) => r.getAllAsync()).finally(() => stmt.finalizeAsync());
				}),
			get: (params) =>
				this.client.prepareAsync(query.sql).then((stmt) => {
					const q = mode === 'arrays'
						? stmt.executeForRawResultAsync(params as any[])
						: stmt.executeAsync(params as any[]);

					return q.then((r) => r.getFirstAsync()).finally(() => stmt.finalizeAsync());
				}),
			run: (params) =>
				this.client.prepareAsync(query.sql).then((stmt) =>
					stmt.executeAsync(params as any[]).then(({ changes, lastInsertRowId }) => ({
						changes,
						lastInsertRowId,
					})).finally(() => stmt.finalizeAsync())
				),
			values: (params) =>
				this.client.prepareAsync(query.sql).then((stmt) =>
					stmt.executeForRawResultAsync(params as any[]).then((r) => r.getAllAsync()).finally(() =>
						stmt.finalizeAsync()
					)
				),
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

	override async transaction<T>(
		transaction: (tx: ExpoSQLiteAsyncTransaction<TRelations>) => Promise<T>,
		config: SQLiteTransactionConfig = {},
	): Promise<T> {
		if (config?.behavior === 'concurrent') throw new Error('Concurrent transactions are not supported by driver');

		const tx = new ExpoSQLiteAsyncTransaction('async', this.dialect, this, this.relations);
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

export class ExpoSQLiteAsyncTransaction<
	TRelations extends AnyRelations,
> extends SQLiteAsyncTransaction<'async', ExpoSQLiteAsyncRunResult, TRelations> {
	static override readonly [entityKind]: string = 'ExpoSQLiteAsyncTransaction';

	override async transaction<T>(transaction: (tx: ExpoSQLiteAsyncTransaction<TRelations>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new ExpoSQLiteAsyncTransaction(
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
			return result as T;
		} catch (err) {
			await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}
