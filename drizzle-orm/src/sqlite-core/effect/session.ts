import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import { EffectCache, type EffectCacheShape } from '~/cache/core/cache-effect.ts';
import { NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { EffectDrizzleQueryError, EffectTransactionRollbackError, MigratorInitError } from '~/effect-core/errors.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase, QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind, is } from '~/entity.ts';
import { runEffect } from '~/generator-queries/run-effect-sqlite.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import {
	type PreparedQueryConfig,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery,
	SQLiteSession,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { migrate as coreMigrate } from '~/sqlite-core/session.ts';
import { assertUnreachable } from '~/utils.ts';
import { SQLiteEffectDatabase } from './db.ts';

export type SQLiteEffectQueryExecutors = Record<
	SQLiteExecuteMethod,
	(params: unknown[]) => Effect.Effect<any, unknown, unknown>
>;

export class SQLiteEffectPreparedQuery<
	T extends PreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends SQLitePreparedQuery {
	static override readonly [entityKind]: string = 'SQLiteEffectPreparedQuery';

	constructor(
		executeMethod: SQLiteExecuteMethod = 'all',
		protected executors: SQLiteEffectQueryExecutors,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
		private logger: EffectLoggerShape,
		// cache instance
		protected cache: EffectCacheShape,
		// per query related metadata
		protected queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		protected cacheConfig: WithCacheConfig | undefined,
	) {
		super(executeMethod, query, mapper, mode);

		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}
	}

	override run(placeholderValues: Record<string, unknown> = {}): QueryEffectKind<TEffectHKT, T['run']> {
		return Effect.gen({ self: this }, function*() {
			const { query, logger, executors } = this;
			const sql = query._sql ? query._sql.join(' ') : query.sql;
			const params = query.params.length === 0
				? query.params
				: fillPlaceholders(query.params, placeholderValues);

			yield* logger.logQuery(sql, params);

			return yield* this.queryWithCache(sql, params, 'run', Effect.suspend(() => executors.run(params)));
		}) as QueryEffectKind<TEffectHKT, T['run']>;
	}

	override all(placeholderValues: Record<string, unknown> = {}): QueryEffectKind<TEffectHKT, T['all']> {
		return Effect.gen({ self: this }, function*() {
			const { query, logger, executors, mapper } = this;
			const sql = query._sql ? query._sql.join(' ') : query.sql;
			const params = query.params.length === 0
				? query.params
				: fillPlaceholders(query.params, placeholderValues);

			yield* logger.logQuery(sql, params);

			const rows = yield* this.queryWithCache(sql, params, 'all', Effect.suspend(() => executors.all(params)));

			return mapper ? mapper(rows as unknown[]) : rows;
		}) as QueryEffectKind<TEffectHKT, T['all']>;
	}

	override get(placeholderValues: Record<string, unknown> = {}): QueryEffectKind<TEffectHKT, T['get']> {
		return Effect.gen({ self: this }, function*() {
			const { query, logger, executors, mapper } = this;
			const sql = query._sql ? query._sql.join(' ') : query.sql;
			const params = query.params.length === 0
				? query.params
				: fillPlaceholders(query.params, placeholderValues);

			yield* logger.logQuery(sql, params);

			const row = yield* this.queryWithCache(sql, params, 'get', Effect.suspend(() => executors.get(params)));

			if (!row) return;
			if (!mapper) return row;
			return mapper([row])[0];
		}) as QueryEffectKind<TEffectHKT, T['get']>;
	}

	override values(placeholderValues: Record<string, unknown> = {}): QueryEffectKind<TEffectHKT, T['values']> {
		return Effect.gen({ self: this }, function*() {
			const { query, logger, executors } = this;
			const sql = query._sql ? query._sql.join(' ') : query.sql;
			const params = query.params.length === 0
				? query.params
				: fillPlaceholders(query.params, placeholderValues);

			yield* logger.logQuery(sql, params);

			return yield* this.queryWithCache(sql, params, 'values', Effect.suspend(() => executors.values(params)));
		}) as QueryEffectKind<TEffectHKT, T['values']>;
	}

	override execute(placeholderValues?: Record<string, unknown>): QueryEffectKind<TEffectHKT, T['execute']> {
		return this[this.executeMethod](placeholderValues) as QueryEffectKind<TEffectHKT, T['execute']>;
	}

	/** @internal */
	protected queryWithCache<A, E, R>(
		queryString: string,
		params: any[],
		executeMethod: SQLiteExecuteMethod,
		query: Effect.Effect<A, E, R>,
	) {
		return Effect.gen({ self: this }, function*() {
			const { cacheConfig, queryMetadata } = this;
			const cache = yield* EffectCache;

			const cacheStrat: Awaited<ReturnType<typeof strategyFor>> = cache && !(cache.cache && is(cache.cache, NoopCache))
				? yield* Effect.tryPromise(
					() => strategyFor(queryString, params, queryMetadata, cacheConfig),
				)
				: { type: 'skip' as const };

			if (cacheStrat.type === 'skip') {
				return yield* query;
			}

			// For mutate queries, we should query the database, wait for a response, and then perform invalidation
			if (cacheStrat.type === 'invalidate') {
				const result = yield* query;
				yield* cache!.onMutate({ tables: cacheStrat.tables });

				return result;
			}

			if (cacheStrat.type === 'try') {
				const { tables, key: _key, isTag, autoInvalidate, config } = cacheStrat;
				const key = `${executeMethod}_${_key}`;

				const fromCache: any[] | undefined = yield* cache!.get(
					key,
					tables,
					isTag,
					autoInvalidate,
				);

				if (typeof fromCache !== 'undefined') return fromCache as unknown as A;

				const result = yield* query;

				yield* cache.put(
					key,
					result,
					autoInvalidate ? tables : [],
					isTag,
					config,
				);

				return result;
			}

			assertUnreachable(cacheStrat);
		}).pipe(
			Effect.provideService(EffectCache, this.cache),
			Effect.catch((e) => {
				return Effect.fail(new EffectDrizzleQueryError({ query: queryString, params, cause: Cause.fail(e) }));
			}),
		);
	}
}

export abstract class SQLiteEffectSession<
	TRunResult,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteSession<TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteEffectSession';

	declare readonly dialect: SQLiteDialect;

	constructor(dialect: SQLiteDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
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
	): SQLiteEffectPreparedQuery<T, TEffectHKT>;

	run(query: SQL): QueryEffectKind<TEffectHKT, TRunResult> {
		return this.prepareQuery<PreparedQueryConfig & { type: unknown; run: TRunResult }>(
			this.dialect.sqlToQuery(query),
			'raw',
			false,
			'run',
		).run() as QueryEffectKind<TEffectHKT, TRunResult>;
	}

	objects<T = unknown>(query: SQL): QueryEffectKind<TEffectHKT, T[]> {
		return this.prepareQuery<PreparedQueryConfig & { type: unknown; all: T[] }>(
			this.dialect.sqlToQuery(query),
			'objects',
			false,
			'all',
		).all() as QueryEffectKind<TEffectHKT, T[]>;
	}

	object<T = unknown>(query: SQL): QueryEffectKind<TEffectHKT, T> {
		return this.prepareQuery<PreparedQueryConfig & { type: unknown; get: T }>(
			this.dialect.sqlToQuery(query),
			'objects',
			false,
			'get',
		).get() as QueryEffectKind<TEffectHKT, T>;
	}

	arrays<T extends any[] = unknown[]>(query: SQL): QueryEffectKind<TEffectHKT, T[]> {
		return this.prepareQuery<PreparedQueryConfig & { type: unknown; all: T[] }>(
			this.dialect.sqlToQuery(query),
			'arrays',
			false,
			'all',
		).all() as QueryEffectKind<TEffectHKT, T[]>;
	}

	array<T extends any[] = unknown[]>(query: SQL): QueryEffectKind<TEffectHKT, T> {
		return this.prepareQuery<PreparedQueryConfig & { type: unknown; get: T }>(
			this.dialect.sqlToQuery(query),
			'arrays',
			false,
			'get',
		).get() as QueryEffectKind<TEffectHKT, T>;
	}

	abstract transaction<A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<TEffectHKT, TRunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
		config?: SQLiteTransactionConfig,
	): Effect.Effect<A, E | SqlError, R>;
}

export abstract class SQLiteEffectTransaction<
	TEffectHKT extends QueryEffectHKTBase,
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteEffectDatabase<TEffectHKT, TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteEffectTransaction';

	constructor(
		dialect: SQLiteDialect,
		session: SQLiteEffectSession<any, TEffectHKT, any>,
		relations: TRelations,
		protected readonly nestedIndex = 0,
		forbidJsonb?: boolean,
	) {
		super(dialect, session, relations, forbidJsonb);
	}

	rollback() {
		return new EffectTransactionRollbackError();
	}
}

export const migrate = Effect.fn('migrate')(function*<TEffectHKT extends QueryEffectHKTBase>(
	migrations: MigrationMeta[],
	db: SQLiteEffectDatabase<TEffectHKT, any>,
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
) {
	const result = yield* runEffect(db, coreMigrate(migrations, config));

	if (result?.exitCode) {
		return yield* new MigratorInitError({ exitCode: result.exitCode });
	}
});
