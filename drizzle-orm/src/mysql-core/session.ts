import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { assertUnreachable } from '~/utils.ts';
import { MySqlDatabase } from './db.ts';
import type { MySqlDialect } from './dialect.ts';

export interface MySqlQueryResultHKT {
	readonly $brand: 'MySqlQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export interface AnyMySqlQueryResultHKT extends MySqlQueryResultHKT {
	readonly type: any;
}

export type MySqlQueryResultKind<TKind extends MySqlQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface MySqlPreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface MySqlPreparedQueryHKT {
	readonly $brand: 'MySqlPreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type AnyMySqlMapper = (
	response: Record<string, unknown>[] | unknown[][] | { insertId: number; affectedRows: number },
) => any;

export class MySqlPreparedQuery<T extends MySqlPreparedQueryConfig> {
	static readonly [entityKind]: string = 'MySqlPreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	private fastPath: boolean;

	constructor(
		protected executor: (params?: unknown[]) => Promise<any>,
		protected _iterator: ((params?: unknown[]) => AsyncGenerator<any[]>) | undefined,
		protected query: Query,
		mapper:
			| AnyMySqlMapper
			| undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		protected logger: Logger,
		// cache instance
		private cache: Cache | undefined,
		// per query related metadata
		private queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		private cacheConfig?: WithCacheConfig | undefined,
	) {
		this.mapper = mapper;
		// it means that no $withCache options were passed and it should be just enabled
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}

		this.fastPath = cacheConfig === undefined
			&& (cache === undefined || is(cache, NoopCache));
	}

	/** @internal */
	protected async queryWithCache<T>(
		queryString: string,
		params: any[],
		query: () => Promise<T>,
	): Promise<T> {
		const cacheStrat = this.cache !== undefined && !is(this.cache, NoopCache)
			? await strategyFor(queryString, params, this.queryMetadata, this.cacheConfig)
			: { type: 'skip' as const };

		if (cacheStrat.type === 'skip') {
			return query().catch((e) => {
				throw new DrizzleQueryError(queryString, params, e as Error);
			});
		}

		const cache = this.cache!;

		// For mutate queries, we should query the database, wait for a response, and then perform invalidation
		if (cacheStrat.type === 'invalidate') {
			return Promise.all([
				query(),
				cache.onMutate({ tables: cacheStrat.tables }),
			]).then((res) => res[0]).catch((e) => {
				throw new DrizzleQueryError(queryString, params, e as Error);
			});
		}

		if (cacheStrat.type === 'try') {
			const { tables, key, isTag, autoInvalidate, config } = cacheStrat;
			const fromCache = await cache.get(
				key,
				tables,
				isTag,
				autoInvalidate,
			);

			if (fromCache === undefined) {
				const result = await query().catch((e) => {
					throw new DrizzleQueryError(queryString, params, e as Error);
				});
				// put actual key
				await cache.put(
					key,
					result,
					// make sure we send tables that were used in a query only if user wants to invalidate it on each write
					autoInvalidate ? tables : [],
					isTag,
					config,
				);
				// put flag if we should invalidate or not
				return result;
			}

			return fromCache as unknown as T;
		}

		assertUnreachable(cacheStrat);
	}

	async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const { query, logger, executor, mapper, fastPath } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);
		const res = fastPath
			? executor(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, () => executor(params));
		if (!mapper) return res;

		return res.then((rows) => mapper(rows));
	}

	async *iterator(placeholderValues: Record<string, unknown> = {}): AsyncGenerator<T['iterator']> {
		const { query, logger, executor, _iterator, mapper } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (_iterator) {
			try {
				if (mapper) {
					for await (const row of _iterator(params)) {
						yield (mapper([row])[0]);
					}

					return;
				}

				for await (const row of _iterator(params)) {
					yield row as Awaited<T['iterator']>;
				}

				return;
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}
		}

		const rows = await executor(params).catch((e) => {
			throw new DrizzleQueryError(sql, params, e as Error);
		}) as T['iterator'][];

		if (mapper) {
			for (const row of rows) {
				yield mapper([row])[0];
			}

			return;
		}

		for (const row of rows) {
			yield row;
		}

		return;
	}
}

export interface MySqlTransactionConfig {
	withConsistentSnapshot?: boolean;
	accessMode?: 'read only' | 'read write';
	isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
}

export abstract class MySqlSession<
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'MySqlSession';

	constructor(protected dialect: MySqlDialect) {}

	abstract prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): MySqlPreparedQuery<T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
			'raw',
		).execute();
	}

	arrays<T>(query: SQL): Promise<T[]> {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'arrays',
		).execute();
	}

	objects<T>(query: SQL): Promise<T[]> {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'objects',
		).execute();
	}

	abstract transaction<T>(
		transaction: (
			tx: MySqlTransaction<TQueryResult, TRelations>,
		) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T>;

	protected getSetTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.isolationLevel) {
			parts.push(`isolation level ${config.isolationLevel}`);
		}

		return parts.length ? sql`set transaction ${sql.raw(parts.join(' '))}` : undefined;
	}

	protected getStartTransactionSQL(config: MySqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.withConsistentSnapshot) {
			parts.push('with consistent snapshot');
		}

		if (config.accessMode) {
			parts.push(config.accessMode);
		}

		return parts.length ? sql`start transaction ${sql.raw(parts.join(' '))}` : undefined;
	}
}

export abstract class MySqlTransaction<
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'MySqlTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlSession,
		protected relations: TRelations,
		protected readonly nestedIndex: number,
	) {
		super(dialect, session, relations);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<T>(
		transaction: (
			tx: MySqlTransaction<TQueryResult, TRelations>,
		) => Promise<T>,
	): Promise<T>;
}
