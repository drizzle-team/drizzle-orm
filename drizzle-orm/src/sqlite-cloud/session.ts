import type { Database, SQLiteCloudRow, SQLiteCloudRowset } from '@sqlitecloud/drivers';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
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
import type { SQLiteCloudRunResult } from './driver.ts';

export interface SQLiteCloudSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteCloudSession<TRelations extends AnyRelations>
	extends SQLiteAsyncSession<'async', SQLiteCloudRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLiteCloudSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: Database,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: SQLiteCloudSessionOptions,
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
	): SQLiteAsyncPreparedQuery<T & { run: SQLiteCloudRunResult }> {
		let stmt: ReturnType<typeof this.client.prepare>;
		try {
			stmt = this.client.prepare(query.sql);
		} catch (e) {
			throw new DrizzleQueryError(query.sql, query.params, e as Error);
		}

		const executors: SQLiteQueryExecutors<'async'> = {
			all: (params) => {
				if (mode === 'arrays') {
					return new Promise<any>((resolve, reject) => {
						(params.length ? stmt.bind(...params) : stmt).all((e: Error | null, d: SQLiteCloudRowset) => {
							if (e) return reject(e);

							return (resolve(d.map((v) => v.getData())));
						});
					});
				}
				return new Promise<any>((resolve, reject) => {
					(params.length ? stmt.bind(...params) : stmt).all((e: Error | null, d: SQLiteCloudRowset) => {
						if (e) return reject(e);

						return resolve(d.map((v) => Object.fromEntries(Object.entries(v))));
					});
				});
			},
			get: (params) => {
				if (mode === 'arrays') {
					return new Promise<any>((resolve, reject) => {
						(params.length ? stmt.bind(...params) : stmt).get((e: Error | null, d: SQLiteCloudRow | undefined) => {
							if (e) return reject(e);

							return resolve(d ? d.getData() : d);
						});
					});
				}
				return new Promise<any>((resolve, reject) => {
					(params.length ? stmt.bind(...params) : stmt).get((e: Error | null, d: SQLiteCloudRow | undefined) => {
						if (e) return reject(e);

						return resolve(d ? Object.fromEntries(Object.entries(d)) : d);
					});
				});
			},
			run: (params) => {
				return new Promise<any>((resolve, reject) => {
					(params.length ? stmt.bind(...params) : stmt).run((e: Error | null, d: SQLiteCloudRowset) => {
						if (e) return reject(e);

						return resolve(d);
					});
				});
			},
			values: (params) => {
				return new Promise<any>((resolve, reject) => {
					(params.length ? stmt.bind(...params) : stmt).all((e: Error | null, d: SQLiteCloudRowset) => {
						if (e) return reject(e);

						return (resolve(d.map((v) => v.getData())));
					});
				});
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
		transaction: (
			tx: SQLiteCloudTransaction<TRelations>,
		) => Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new SQLiteCloudTransaction(
			'async',
			this.dialect,
			this,
			this.relations,
		);
		await tx.run(sql`BEGIN${sql` ${sql.raw(config?.behavior ?? '')}`.if(config?.behavior)} TRANSACTION`);

		try {
			const result = await transaction(tx);
			await tx.run(sql`COMMIT`);
			return result;
		} catch (err) {
			await tx.run(sql`ROLLBACK`);
			throw err;
		}
	}
}

export class SQLiteCloudTransaction<TRelations extends AnyRelations>
	extends SQLiteAsyncTransaction<'async', SQLiteCloudRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLiteCloudTransaction';

	override async transaction<T>(
		transaction: (tx: SQLiteCloudTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new SQLiteCloudTransaction(
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
