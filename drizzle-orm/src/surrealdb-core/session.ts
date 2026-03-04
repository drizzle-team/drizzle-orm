import { type Cache, hashQuery, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import type { Assume, Equal } from '~/utils.ts';
import { SurrealDBDatabase } from './db.ts';
import type { SurrealDBDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface SurrealDBQueryResultHKT {
	readonly $brand: 'SurrealDBQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export interface AnySurrealDBQueryResultHKT extends SurrealDBQueryResultHKT {
	readonly type: any;
}

export type SurrealDBQueryResultKind<TKind extends SurrealDBQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface SurrealDBPreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface SurrealDBPreparedQueryHKT {
	readonly $brand: 'SurrealDBPreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type PreparedQueryKind<
	TKind extends SurrealDBPreparedQueryHKT,
	TConfig extends SurrealDBPreparedQueryConfig,
	TAssume extends boolean = false,
> = Equal<TAssume, true> extends true
	? Assume<(TKind & { readonly config: TConfig })['type'], SurrealDBPreparedQuery<TConfig>>
	: (TKind & { readonly config: TConfig })['type'];

export abstract class SurrealDBPreparedQuery<T extends SurrealDBPreparedQueryConfig> {
	static readonly [entityKind]: string = 'SurrealDBPreparedQuery';

	constructor(
		private cache?: Cache,
		private queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		private cacheConfig?: WithCacheConfig,
	) {
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

		if (this.cacheConfig && !this.cacheConfig.enable) {
			try {
				return await query();
			} catch (e) {
				throw new DrizzleQueryError(queryString, params, e as Error);
			}
		}

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

export interface SurrealDBTransactionConfig {
	// SurrealDB transactions are simpler; no isolation level control
}

export abstract class SurrealDBSession<
	TQueryResult extends SurrealDBQueryResultHKT = SurrealDBQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'SurrealDBSession';

	constructor(protected dialect: SurrealDBDialect) {}

	abstract prepareQuery<
		T extends SurrealDBPreparedQueryConfig,
		TPreparedQueryHKT extends SurrealDBPreparedQueryHKT,
	>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PreparedQueryKind<TPreparedQueryHKT, T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<SurrealDBPreparedQueryConfig & { execute: T }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			undefined,
		).execute();
	}

	abstract all<T = unknown>(query: SQL): Promise<T[]>;

	async count(sql: SQL): Promise<number> {
		const res = await this.execute<Array<{ count: number }>>(sql);

		return Number(
			(res as any)[0]?.['count'] ?? 0,
		);
	}

	abstract transaction<T>(
		transaction: (tx: SurrealDBTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
		config?: SurrealDBTransactionConfig,
	): Promise<T>;
}

export abstract class SurrealDBTransaction<
	TQueryResult extends SurrealDBQueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> extends SurrealDBDatabase<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'SurrealDBTransaction';

	constructor(
		dialect: SurrealDBDialect,
		session: SurrealDBSession<any, any, any, any>,
		protected override readonly schema: RelationalSchemaConfig<TSchema> | undefined,
		protected readonly nestedIndex: number,
	) {
		super(dialect, session as any, schema);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	abstract override transaction<T>(
		transaction: (tx: SurrealDBTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface PreparedQueryHKTBase extends SurrealDBPreparedQueryHKT {
	type: SurrealDBPreparedQuery<Assume<this['config'], SurrealDBPreparedQueryConfig>>;
}
