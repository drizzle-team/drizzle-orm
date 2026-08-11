import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { assertUnreachable, type Assume, type Equal } from '~/utils.ts';
import { SingleStoreDatabase } from './db.ts';
import type { SingleStoreDialect } from './dialect.ts';

export interface SingleStoreQueryResultHKT {
	readonly $brand: 'SingleStoreQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export interface AnySingleStoreQueryResultHKT extends SingleStoreQueryResultHKT {
	readonly type: any;
}

export type SingleStoreQueryResultKind<TKind extends SingleStoreQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface SingleStorePreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface SingleStorePreparedQueryHKT {
	readonly $brand: 'SingleStorePreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type AnySingleStoreMapper = (
	response: Record<string, unknown>[] | unknown[][] | { insertId: number; affectedRows: number },
) => any;

export type PreparedQueryKind<
	TKind extends SingleStorePreparedQueryHKT,
	TConfig extends SingleStorePreparedQueryConfig,
	TAssume extends boolean = false,
> = Equal<TAssume, true> extends true
	? Assume<(TKind & { readonly config: TConfig })['type'], SingleStoreBasePreparedQuery<TConfig>>
	: (TKind & { readonly config: TConfig })['type'];

export abstract class SingleStoreBasePreparedQuery<T extends SingleStorePreparedQueryConfig> implements PreparedQuery {
	static readonly [entityKind]: string = 'SingleStoreBasePreparedQuery';

	constructor(
		protected query: Query,
	) {}

	getQuery(): Query {
		return this.query;
	}

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	abstract iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']>;
}

export class SingleStorePreparedQuery<T extends SingleStorePreparedQueryConfig>
	extends SingleStoreBasePreparedQuery<T>
{
	static override readonly [entityKind]: string = 'SingleStorePreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	private fastPath: boolean;

	constructor(
		protected executor: (params?: unknown[]) => Promise<any>,
		protected _iterator: ((params?: unknown[]) => AsyncGenerator<any>) | undefined,
		query: Query,
		mapper: AnySingleStoreMapper | undefined,
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
		super(query);
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

	override async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const { query, logger, executor, mapper, fastPath } = this;
		const { sql } = query;
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

	override async *iterator(placeholderValues: Record<string, unknown> = {}): AsyncGenerator<T['iterator']> {
		const { query, logger, executor, _iterator, mapper, fastPath } = this;
		const { sql } = query;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (_iterator) {
			try {
				if (mapper) {
					for await (const row of _iterator(params)) {
						const mapped = mapper([row]);
						yield Array.isArray(mapped) ? mapped[0] : mapped;
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

		// Fallback for compatibility between drivers
		const rows = await (fastPath
			? executor(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, () => executor(params)));

		if (mapper) {
			for (const row of rows) {
				const mapped = mapper([row]);
				yield Array.isArray(mapped) ? mapped[0] : mapped;
			}

			return;
		}

		for (const row of rows) {
			yield row;
		}
	}
}

export interface SingleStoreTransactionConfig {
	withConsistentSnapshot?: boolean;
	accessMode?: 'read only' | 'read write';
	isolationLevel: 'read committed'; // SingleStore only supports read committed isolation level (https://docs.singlestore.com/db/v8.7/introduction/faqs/durability/)
}

export abstract class SingleStoreSession<
	TQueryResult extends SingleStoreQueryResultHKT = SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'SingleStoreSession';

	constructor(protected dialect: SingleStoreDialect) {}

	abstract prepareQuery<
		T extends SingleStorePreparedQueryConfig,
		TPreparedQueryHKT extends SingleStorePreparedQueryHKT,
	>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PreparedQueryKind<TPreparedQueryHKT, T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<SingleStorePreparedQueryConfig & { execute: T }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			'raw',
		).execute();
	}

	arrays<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<SingleStorePreparedQueryConfig & { execute: T[] }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			'arrays',
		).execute();
	}

	objects<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<SingleStorePreparedQueryConfig & { execute: T[] }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			'objects',
		).execute();
	}

	async count(sql: SQL): Promise<number> {
		const res = await this.execute<[[{ count: string }]]>(sql);

		return Number(
			res[0][0]['count'],
		);
	}

	abstract transaction<T>(
		transaction: (
			tx: SingleStoreTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TRelations, TSchema>,
		) => Promise<T>,
		config?: SingleStoreTransactionConfig,
	): Promise<T>;

	protected getSetTransactionSQL(config: SingleStoreTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.isolationLevel) {
			parts.push(`isolation level ${config.isolationLevel}`);
		}

		return parts.length ? sql`set transaction ${sql.raw(parts.join(' '))}` : undefined;
	}

	protected getStartTransactionSQL(config: SingleStoreTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.withConsistentSnapshot) {
			parts.push('with consistent snapshot');
		}

		if (config.accessMode) {
			parts.push(config.accessMode);
		}

		return parts.length ? sql`start transaction ${sql.raw(parts.join(', '))}` : undefined;
	}
}

export abstract class SingleStoreTransaction<
	TQueryResult extends SingleStoreQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = Record<string, never>,
> extends SingleStoreDatabase<TQueryResult, TPreparedQueryHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SingleStoreTransaction';

	constructor(
		dialect: SingleStoreDialect,
		session: SingleStoreSession,
		protected relations: TRelations,
		protected schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		protected readonly nestedIndex: number,
	) {
		super(dialect, session, relations, schema);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<T>(
		transaction: (
			tx: SingleStoreTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TRelations, TSchema>,
		) => Promise<T>,
	): Promise<T>;
}

export interface PreparedQueryHKTBase extends SingleStorePreparedQueryHKT {
	type: SingleStoreBasePreparedQuery<Assume<this['config'], SingleStorePreparedQueryConfig>>;
}
