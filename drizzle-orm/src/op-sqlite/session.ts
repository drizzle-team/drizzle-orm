import type { DB, QueryResult } from '@op-engineering/op-sqlite';
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

export interface OPSQLiteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export type OPSQLiteRunResult = QueryResult;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class OPSQLiteSession<TRelations extends AnyRelations>
	extends SQLiteAsyncSession<'async', OPSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'OPSQLiteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: DB,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: OPSQLiteSessionOptions = {},
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
	): SQLiteAsyncPreparedQuery<T & { run: OPSQLiteRunResult }> {
		const executors: SQLiteQueryExecutors<'async'> = {
			all: (params) => {
				if (mode === 'arrays') return this.client.executeRaw(query.sql, params as any[]).then(({ rawRows }) => rawRows);
				return this.client.execute(query.sql, params as any[]).then(({ rows }) => rows);
			},
			get: (params) => {
				if (mode === 'arrays') {
					return this.client.executeRaw(query.sql, params as any[]).then(({ rawRows }) => rawRows[0]);
				}
				return this.client.execute(query.sql, params as any[]).then(({ rows }) => rows[0]);
			},
			run: (params) => {
				return this.client.execute(query.sql, params as any[]);
			},
			values: (params) => {
				return this.client.executeRaw(query.sql, params as any[]).then(({ rawRows }) => rawRows);
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
		transaction: (tx: OPSQLiteTransaction<TRelations>) => T | Promise<T>,
		config: SQLiteTransactionConfig = {},
	): Promise<T> {
		if (config?.behavior === 'concurrent') throw new Error('Concurrent transactions are not supported by driver');

		const tx = new OPSQLiteTransaction('async', this.dialect, this, this.relations);
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

export class OPSQLiteTransaction<TRelations extends AnyRelations>
	extends SQLiteAsyncTransaction<'async', OPSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'OPSQLiteTransaction';

	override async transaction<T>(
		transaction: (tx: OPSQLiteTransaction<TRelations>) => T | Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new OPSQLiteTransaction(
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
