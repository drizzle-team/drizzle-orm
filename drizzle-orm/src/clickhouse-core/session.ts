import { type Cache, hashQuery, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import type { Assume, Equal } from '~/utils.ts';
import type { ClickHouseDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface ClickHouseQueryResultHKT {
	readonly $brand: 'ClickHouseQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export interface AnyClickHouseQueryResultHKT extends ClickHouseQueryResultHKT {
	readonly type: any;
}

export type ClickHouseQueryResultKind<TKind extends ClickHouseQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface ClickHousePreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface ClickHousePreparedQueryHKT {
	readonly $brand: 'ClickHousePreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type PreparedQueryKind<
	TKind extends ClickHousePreparedQueryHKT,
	TConfig extends ClickHousePreparedQueryConfig,
	TAssume extends boolean = false,
> = Equal<TAssume, true> extends true
	? Assume<(TKind & { readonly config: TConfig })['type'], ClickHousePreparedQuery<TConfig>>
	: (TKind & { readonly config: TConfig })['type'];

/** What a prepared query does, for the purposes of cache invalidation. */
export interface ClickHouseQueryMetadata {
	type: 'select' | 'update' | 'delete' | 'insert';
	tables: string[];
}

export abstract class ClickHousePreparedQuery<T extends ClickHousePreparedQueryConfig> {
	static readonly [entityKind]: string = 'ClickHousePreparedQuery';

	constructor(
		private cache?: Cache,
		private queryMetadata?: ClickHouseQueryMetadata | undefined,
		// config that was passed through $withCache
		private cacheConfig?: WithCacheConfig,
	) {
		// it means that no $withCache options were passed and it should be just enabled
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enable: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enable) {
			this.cacheConfig = undefined;
		}
	}

	/** @internal */
	protected async queryWithCache<T>(
		queryString: string,
		params: any[],
		query: () => Promise<T>,
	): Promise<T> {
		if (this.cache === undefined || is(this.cache, NoopCache) || this.queryMetadata === undefined) {
			try {
				return await query();
			} catch (e) {
				throw new DrizzleQueryError(queryString, params, e as Error);
			}
		}

		// don't do any mutations, if globally is false
		if (this.cacheConfig && !this.cacheConfig.enable) {
			try {
				return await query();
			} catch (e) {
				throw new DrizzleQueryError(queryString, params, e as Error);
			}
		}

		// For mutate queries, we should query the database, wait for a response, and then perform invalidation
		if (
			(
				this.queryMetadata.type === 'insert' || this.queryMetadata.type === 'update'
				|| this.queryMetadata.type === 'delete'
			) && this.queryMetadata.tables.length > 0
		) {
			try {
				const [res] = await Promise.all([
					query(),
					this.cache.onMutate({ tables: this.queryMetadata.tables }),
				]);
				return res;
			} catch (e) {
				throw new DrizzleQueryError(queryString, params, e as Error);
			}
		}

		// don't do any reads if globally disabled
		if (!this.cacheConfig) {
			try {
				return await query();
			} catch (e) {
				throw new DrizzleQueryError(queryString, params, e as Error);
			}
		}

		if (this.queryMetadata.type === 'select') {
			const fromCache = await this.cache.get(
				this.cacheConfig.tag ?? await hashQuery(queryString, params),
				this.queryMetadata.tables,
				this.cacheConfig.tag !== undefined,
				this.cacheConfig.autoInvalidate,
			);
			if (fromCache === undefined) {
				let result;
				try {
					result = await query();
				} catch (e) {
					throw new DrizzleQueryError(queryString, params, e as Error);
				}

				await this.cache.put(
					this.cacheConfig.tag ?? await hashQuery(queryString, params),
					result,
					// make sure we send tables that were used in a query only if user wants to invalidate it on each write
					this.cacheConfig.autoInvalidate ? this.queryMetadata.tables : [],
					this.cacheConfig.tag !== undefined,
					this.cacheConfig.config,
				);
				return result;
			}

			return fromCache as unknown as T;
		}
		try {
			return await query();
		} catch (e) {
			throw new DrizzleQueryError(queryString, params, e as Error);
		}
	}

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	abstract iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']>;
}

/**
 * A ClickHouse session.
 *
 * There is no `transaction()`: ClickHouse's transaction support is experimental, limited to a single
 * node and off by default, so Drizzle does not pretend to offer atomicity it cannot deliver. Batch
 * writes instead — a single multi-row `INSERT` is atomic per part.
 */
export abstract class ClickHouseSession<
	TQueryResult extends ClickHouseQueryResultHKT = ClickHouseQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
> {
	static readonly [entityKind]: string = 'ClickHouseSession';

	constructor(protected dialect: ClickHouseDialect) {}

	abstract prepareQuery<
		T extends ClickHousePreparedQueryConfig,
		TPreparedQueryHKT extends ClickHousePreparedQueryHKT,
	>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		queryMetadata?: ClickHouseQueryMetadata,
		cacheConfig?: WithCacheConfig,
	): PreparedQueryKind<TPreparedQueryHKT, T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<ClickHousePreparedQueryConfig & { execute: T }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			undefined,
		).execute();
	}

	abstract all<T = unknown>(query: SQL): Promise<T[]>;

	async count(sql: SQL): Promise<number> {
		const rows = await this.all<{ count: string | number }>(sql);
		return Number(rows[0]?.['count'] ?? 0);
	}

	/** Declared for symmetry with the other dialects; `TQueryResult` is only used at the type level. */
	declare readonly $queryResult: TQueryResult;
	declare readonly $preparedQueryHKT: TPreparedQueryHKT;
}

export interface PreparedQueryHKTBase extends ClickHousePreparedQueryHKT {
	type: ClickHousePreparedQuery<Assume<this['config'], ClickHousePreparedQueryConfig>>;
}
