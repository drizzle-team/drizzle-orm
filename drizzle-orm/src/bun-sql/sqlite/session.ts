/// <reference types="bun-types" />

import type { SavepointSQL, SQL as BunSQL, TransactionSQL } from 'bun';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import {
	SQLiteAsyncPreparedQuery,
	type SQLiteAsyncPreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteAsyncSession,
	SQLiteAsyncTransaction,
	type SQLiteQueryExecutors,
} from '~/sqlite-core/async/session.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteExecuteMethod, SQLiteTransactionConfig } from '~/sqlite-core/session.ts';

export interface BunSQLiteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export type BunSQLiteRunResult = Record<string, unknown>[] & Record<string, unknown>;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class BunSQLiteSession<
	TSQL extends BunSQL,
	TRelations extends AnyRelations,
> extends SQLiteAsyncSession<'async', BunSQLiteRunResult, TRelations> {
	static override readonly [entityKind]: string = 'BunSQLiteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		readonly client: TSQL,
		dialect: SQLiteDialect,
		private relations: TRelations,
		readonly options: BunSQLiteSessionOptions,
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
	): SQLiteAsyncPreparedQuery<T & { run: BunSQLiteRunResult }> {
		const executors: SQLiteQueryExecutors<'async'> = {
			all: (params) => {
				const q = this.client.unsafe(query.sql, params);

				if (mode === 'arrays') return q.values();
				return q;
			},
			get: (params) => {
				const q = this.client.unsafe(query.sql, params);

				if (mode === 'arrays') return q.values().then((rows) => rows[0]);
				return q.then((rows) => rows[0]);
			},
			run: (params) => {
				return this.client.unsafe(query.sql, params);
			},
			values: (params) => {
				return this.client.unsafe(query.sql, params).values();
			},
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
		transaction: (db: BunSQLiteTransaction<TRelations>) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		return this.client.begin(config?.behavior ?? '', async (client) => {
			const session = new BunSQLiteSession<SavepointSQL, TRelations>(
				client,
				this.dialect,
				this.relations,
				this.options,
			);
			const tx = new BunSQLiteTransaction<TRelations>(
				'async',
				this.dialect,
				session,
				this.relations,
			);

			return await transaction(tx);
		}) as Promise<T>;
	}
}

export class BunSQLiteTransaction<
	TRelations extends AnyRelations,
> extends SQLiteAsyncTransaction<'async', BunSQLiteRunResult, TRelations> {
	static override readonly [entityKind]: string = 'BunSQLiteTransaction';

	override async transaction<T>(
		transaction: (tx: BunSQLiteTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		return (<BunSQLiteSession<TransactionSQL, any>> <unknown> this.session).client.savepoint(
			async (client) => {
				const session = new BunSQLiteSession<SavepointSQL, TRelations>(
					client,
					this.session.dialect,
					this._.relations,
					(<BunSQLiteSession<TransactionSQL, any>> <unknown> this.session).options,
				);
				const tx = new BunSQLiteTransaction(
					'async',
					this.dialect,
					session,
					this._.relations,
					this.nestedIndex + 1,
				);
				return await transaction(tx);
			},
		);
	}
}
