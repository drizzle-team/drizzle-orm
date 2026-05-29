import type { Client, InArgs, InStatement, ResultSet, Transaction } from '@libsql/client';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import { SQLiteAsyncTransaction } from '~/sqlite-core/async/session.ts';
import {
	SQLiteAsyncPreparedQuery,
	type SQLiteAsyncPreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteAsyncSession,
} from '~/sqlite-core/async/session.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteExecuteMethod, SQLiteQueryExecutors, SQLiteTransactionConfig } from '~/sqlite-core/session.ts';

export interface LibSQLSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export type LibSQLRunResult = ResultSet;

export class LibSQLSession<TRelations extends AnyRelations> extends SQLiteAsyncSession<'async', ResultSet, TRelations> {
	static override readonly [entityKind]: string = 'LibSQLSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: Client,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: LibSQLSessionOptions,
		private tx: Transaction | undefined,
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
	): SQLiteAsyncPreparedQuery<T & { run: LibSQLRunResult }> {
		const client = this.tx ?? this.client;

		const executors: SQLiteQueryExecutors<'async'> = {
			all: (params) =>
				client.execute({ sql: query.sql, args: params as InArgs }).then(({ rows }) =>
					mode === 'arrays' ? rows : rows.map(normalizeRow)
				),
			get: (params) =>
				client.execute({ sql: query.sql, args: params as InArgs }).then(({ rows }) =>
					mode === 'arrays' ? rows[0] : rows[0] ? normalizeRow(rows[0]) : rows[0]
				),
			run: (params) => client.execute({ sql: query.sql, args: params as InArgs }),
			values: (params) => client.execute({ sql: query.sql, args: params as InArgs }).then(({ rows }) => rows),
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

	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T): Promise<BatchResponse<T>>;
	/** @internal */
	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(
		queries: T,
		isMigration?: boolean,
	): Promise<BatchResponse<T>>;
	/** @internal */
	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(
		queries: T,
		isMigration?: boolean,
	): Promise<BatchResponse<T>> {
		const preparedQueries: SQLiteAsyncPreparedQuery<any>[] = [];
		const builtQueries: InStatement[] = [];

		for (const query of queries) {
			const preparedQuery = query._prepare() as SQLiteAsyncPreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push({ sql: builtQuery.sql, args: builtQuery.params as InArgs });
		}

		const batchResults = await (isMigration
			? this.client.migrate(builtQueries)
			: (this.tx ?? this.client).batch(builtQueries));
		return batchResults.map((result, i) => {
			const { executeMethod, mapper, mode } = preparedQueries[i]!;

			if (executeMethod === 'run') return result;
			if (executeMethod === 'values') return result.rows;

			if (executeMethod === 'get') {
				const value = result.rows[0];
				if (!value) return;
				if (!mapper) return mode === 'arrays' ? value : normalizeRow(value);

				return mapper([mode === 'arrays' ? value : normalizeRow(value)])[0];
			}

			const { rows } = result;
			if (!mapper) return mode === 'arrays' ? rows : rows.map(normalizeRow);

			return mapper(mode === 'arrays' ? rows : rows.map(normalizeRow));
		}) as BatchResponse<T>;
	}

	async migrate<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T) {
		return this.batch(queries, true);
	}

	override async transaction<T>(
		transaction: (db: LibSQLTransaction<TRelations>) => T | Promise<T>,
		_config?: SQLiteTransactionConfig,
	): Promise<T> {
		// TODO: support transaction behavior
		const libsqlTx = await this.client.transaction();
		const session = new LibSQLSession<TRelations>(
			this.client,
			this.dialect,
			this.relations,
			this.options,
			libsqlTx,
		);
		const tx = new LibSQLTransaction<TRelations>(
			'async',
			this.dialect,
			session,
			this.relations,
		);
		try {
			const result = await transaction(tx);
			await libsqlTx.commit();
			return result;
		} catch (err) {
			await libsqlTx.rollback();
			throw err;
		}
	}
}

export class LibSQLTransaction<TRelations extends AnyRelations>
	extends SQLiteAsyncTransaction<'async', LibSQLRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'LibSQLTransaction';

	override async transaction<T>(
		transaction: (tx: LibSQLTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new LibSQLTransaction(
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

function normalizeRow(obj: any) {
	// The libSQL node-sqlite3 compatibility wrapper returns rows
	// that can be accessed both as objects and arrays. Let's
	// turn them into objects what's what other SQLite drivers
	// do.
	return Object.keys(obj).reduce((acc: Record<string, any>, key) => {
		if (Object.prototype.propertyIsEnumerable.call(obj, key)) {
			acc[key] = obj[key];
		}
		return acc;
	}, {});
}
