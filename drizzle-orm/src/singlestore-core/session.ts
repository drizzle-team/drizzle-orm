import type * as V1 from '~/_relations.ts';
import { type Cache, hashQuery, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import type { Assume, Equal } from '~/utils.ts';
import { SingleStoreDatabase } from './db.ts';
import type { SingleStoreDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

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

export type PreparedQueryKind<
	TKind extends SingleStorePreparedQueryHKT,
	TConfig extends SingleStorePreparedQueryConfig,
	TAssume extends boolean = false,
> = Equal<TAssume, true> extends true
	? Assume<(TKind & { readonly config: TConfig })['type'], SingleStorePreparedQuery<TConfig>>
	: (TKind & { readonly config: TConfig })['type'];

export abstract class SingleStorePreparedQuery<T extends SingleStorePreparedQueryConfig> {
	static readonly [entityKind]: string = 'SingleStorePreparedQuery';

	constructor(
		private cache?: Cache,
		// per query related metadata
		private queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		private cacheConfig?: WithCacheConfig,
	) {
		// it means that no $withCache options were passed and it should be just enabled
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
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
		if (this.cacheConfig && !this.cacheConfig.enabled) {
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

				// put actual key
				await this.cache.put(
					this.cacheConfig.tag ?? await hashQuery(queryString, params),
					result,
					// make sure we send tables that were used in a query only if user wants to invalidate it on each write
					this.cacheConfig.autoInvalidate ? this.queryMetadata.tables : [],
					this.cacheConfig.tag !== undefined,
					this.cacheConfig.config,
				);
				// put flag if we should invalidate or not
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

	abstract prepareRelationalQuery<
		T extends SingleStorePreparedQueryConfig,
		TPreparedQueryHKT extends SingleStorePreparedQueryHKT,
	>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
	): PreparedQueryKind<TPreparedQueryHKT, T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<SingleStorePreparedQueryConfig & { execute: T }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			undefined,
		).execute();
	}

	abstract all<T = unknown>(query: SQL): Promise<T[]>;

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

		return parts.length ? sql`start transaction ${sql.raw(parts.join(' '))}` : undefined;
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
	type: SingleStorePreparedQuery<Assume<this['config'], SingleStorePreparedQueryConfig>>;
}
