import type { OPSQLiteConnection, QueryResult } from '@op-engineering/op-sqlite';
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
		private client: OPSQLiteConnection,
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
				if (mode === 'arrays') return this.client.executeRawAsync(query.sql, params);
				return this.client.executeAsync(query.sql, params).then(({ rows }) => rows?._array || []);
			},
			get: (params) => {
				if (mode === 'arrays') return this.client.executeRawAsync(query.sql, params).then((rows) => rows[0]);
				return this.client.executeAsync(query.sql, params).then(({ rows }) => rows?._array?.[0]);
			},
			run: (params) => {
				return this.client.executeAsync(query.sql, params);
			},
			values: (params) => {
				return this.client.executeRawAsync(query.sql, params);
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

	override transaction<T>(
		transaction: (tx: OPSQLiteTransaction<TRelations>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new OPSQLiteTransaction('async', this.dialect, this, this.relations);
		this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
		try {
			const result = transaction(tx);
			this.run(sql`commit`);
			return result;
		} catch (err) {
			this.run(sql`rollback`);
			throw err;
		}
	}
}

export class OPSQLiteTransaction<TRelations extends AnyRelations>
	extends SQLiteAsyncTransaction<'async', OPSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'OPSQLiteTransaction';

	override transaction<T>(
		transaction: (tx: OPSQLiteTransaction<TRelations>) => T,
	): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new OPSQLiteTransaction(
			'async',
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
		);
		this.session.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = transaction(tx);
			this.session.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}
