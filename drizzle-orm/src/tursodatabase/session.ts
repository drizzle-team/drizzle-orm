import type { DatabasePromise, StatementPromise } from '@tursodatabase/database-common';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteExecuteMethod,
	SQLiteQueryExecutors,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import type { TursoDatabaseRunResult } from './driver-core.ts';

export interface TursoDatabaseSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class TursoDatabaseSession<TRelations extends AnyRelations>
	extends SQLiteSession<'async', TursoDatabaseRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'TursoDatabaseSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		readonly client: DatabasePromise,
		dialect: SQLiteAsyncDialect,
		private relations: TRelations,
		private options: TursoDatabaseSessionOptions,
	) {
		super(dialect, 'async');
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): SQLitePreparedQuery<T & { run: TursoDatabaseRunResult }> {
		let stmt: StatementPromise;
		const executors: SQLiteQueryExecutors<'async'> = prepare
			? {
				all: async (params) => {
					stmt ??= await this.client.prepare(query.sql);
					return stmt.raw(mode === 'arrays').all(...params);
				},
				get: async (params) => {
					stmt ??= await this.client.prepare(query.sql);
					return stmt.raw(mode === 'arrays').get(...params);
				},
				run: async (params) => {
					stmt ??= await this.client.prepare(query.sql);
					return stmt.run(...params);
				},
				values: async (params) => {
					stmt ??= await this.client.prepare(query.sql);
					return stmt.raw(true).all(...params);
				},
			}
			: {
				all: async (params) => {
					if (stmt || mode === 'arrays') {
						stmt ??= await this.client.prepare(query.sql);
						return stmt.raw(mode === 'arrays').all(...params);
					}

					return this.client.all(query.sql, ...params);
				},
				get: async (params) => {
					if (stmt || mode === 'arrays') {
						stmt ??= await this.client.prepare(query.sql);
						return stmt.raw(mode === 'arrays').get(...params);
					}

					return this.client.get(query.sql, ...params);
				},
				run: (params) => stmt ? stmt.run(...params) : this.client.run(query.sql, ...params),
				values: async (params) => {
					stmt ??= await this.client.prepare(query.sql);
					return stmt.raw(true).all(...params);
				},
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

	override async transaction<T>(
		transaction: (db: TursoDatabaseTransaction<TRelations>) => Promise<T>,
		_config?: SQLiteTransactionConfig,
	): Promise<T> {
		const session = new TursoDatabaseSession<TRelations>(
			this.client,
			this.dialect,
			this.relations,
			this.options,
		);
		const tx = new TursoDatabaseTransaction<TRelations>(
			'async',
			this.dialect,
			session,
			this.relations,
		);

		const clientTx = this.client.transaction(async () => await transaction(tx));

		const result = await clientTx();
		return result;
	}
}

export class TursoDatabaseTransaction<TRelations extends AnyRelations>
	extends SQLiteTransaction<'async', TursoDatabaseRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'TursoDatabaseTransaction';

	declare readonly session: TursoDatabaseSession<TRelations>;

	override async transaction<T>(
		transaction: (tx: TursoDatabaseTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;

		const tx = new TursoDatabaseTransaction(
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
