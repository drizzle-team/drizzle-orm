import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { is } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { type Query, type SQL, sql } from '~/sql/index.ts';
import { tracer } from '~/tracing.ts';
import type { NeonAuthToken } from '~/utils.ts';
import { assertUnreachable } from '~/utils.ts';
import { PgDatabase } from './db.ts';
import type { PgDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class PgBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'PgPreparedQuery';

	constructor(protected query: Query) {}

	getQuery(): Query {
		return this.query;
	}

	mapResult(response: unknown, _isFromBatch?: boolean): unknown {
		return response;
	}

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	/** @internal */
	abstract isResponseInArrayMode(): boolean;
}

export abstract class PgPreparedQuery<T extends PreparedQueryConfig> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PromiseLikePgPreparedQuery';

	constructor(
		query: Query,
		// cache instance
		private cache: Cache | undefined,
		// per query related metadata
		private queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		private cacheConfig?: WithCacheConfig,
	) {
		super(query);
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}
	}

	protected authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;
	/** @internal */
	abstract execute(placeholderValues?: Record<string, unknown>, token?: NeonAuthToken): Promise<T['execute']>;
	/** @internal */
	abstract execute(placeholderValues?: Record<string, unknown>, token?: NeonAuthToken): Promise<T['execute']>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Promise<T['all']>;

	/** @internal */
	protected async queryWithCache<T>(
		queryString: string,
		params: any[],
		query: () => Promise<T>,
	): Promise<T> {
		const cacheStrat = this.cache !== undefined || is(this.cache, NoopCache)
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
}

export interface PgTransactionConfig {
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
	accessMode?: 'read only' | 'read write';
	deferrable?: boolean;
}

export abstract class PgSession<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'PgSession';

	constructor(protected dialect: PgDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgPreparedQuery<T>;

	abstract prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): PgPreparedQuery<T>;

	execute<T>(query: SQL): Promise<T>;
	/** @internal */
	execute<T>(query: SQL, token?: NeonAuthToken): Promise<T>;
	/** @internal */
	execute<T>(query: SQL, token?: NeonAuthToken): Promise<T> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
					this.dialect.sqlToQuery(query),
					undefined,
					undefined,
					false,
				);
			});

			return prepared.setToken(token).execute(undefined, token);
		});
	}

	all<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<PreparedQueryConfig & { all: T[] }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).all();
	}

	async count(sql: SQL): Promise<number>;
	/** @internal */
	async count(sql: SQL, token?: NeonAuthToken): Promise<number>;
	/** @internal */
	async count(sql: SQL, token?: NeonAuthToken): Promise<number> {
		const res = await this.execute<[{ count: string }]>(sql, token);

		return Number(
			res[0]['count'],
		);
	}

	abstract transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T>;
}

export abstract class PgTransaction<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> extends PgDatabase<TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'PgTransaction';

	constructor(
		dialect: PgDialect,
		session: PgSession<any, any, any, any>,
		protected relations: TRelations,
		protected schema: {
			fullSchema: Record<string, unknown>;
			schema: TSchema;
			tableNamesMap: Record<string, string>;
		} | undefined,
		protected readonly nestedIndex = 0,
		parseRqbJson?: boolean,
	) {
		super(dialect, session, relations, schema, parseRqbJson);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** @internal */
	getTransactionConfigSQL(config: PgTransactionConfig): SQL {
		const chunks: string[] = [];
		if (config.isolationLevel) {
			chunks.push(`isolation level ${config.isolationLevel}`);
		}
		if (config.accessMode) {
			chunks.push(config.accessMode);
		}
		if (typeof config.deferrable === 'boolean') {
			chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
		}
		return sql.raw(chunks.join(' '));
	}

	setTransaction(config: PgTransactionConfig): Promise<void> {
		return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
	}

	abstract override transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface PgQueryResultHKT {
	readonly $brand: 'PgQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type PgQueryResultKind<TKind extends PgQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
