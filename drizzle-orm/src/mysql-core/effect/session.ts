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
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { upgradeIfNeeded } from '~/up-migrations/effect-mysql.ts';
import { assertUnreachable } from '~/utils.ts';
import type { MySqlDialect } from '../dialect.ts';
import {
	MySqlBasePreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlQueryResultHKT,
	MySqlSession,
	type MySqlTransactionConfig,
} from '../session.ts';
import { MySqlEffectDatabase } from './db.ts';

export class MySqlEffectPreparedQuery<
	T extends MySqlPreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends MySqlBasePreparedQuery {
	static override readonly [entityKind]: string = 'MySqlEffectPreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	constructor(
		protected executor: (params?: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
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
		super(query);
		this.mapper = mapper;
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}
	}

	override execute(placeholderValues: Record<string, unknown> = {}): QueryEffectKind<TEffectHKT, T['execute']> {
		return Effect.gen({ self: this }, function*() {
			const { query, mapper, logger } = this;
			const sql = query._sql ? query._sql.join(' ') : query.sql;
			const params = query.params.length === 0
				? query.params
				: fillPlaceholders(query.params, placeholderValues);

			yield* logger.logQuery(sql, params);

			const result = this.queryWithCache(sql, params, Effect.suspend(() => this.executor(params)));

			if (!mapper) return yield* result;

			return yield* result.pipe(Effect.map((rows) => mapper(rows as unknown[])));
		});
	}

	/** @internal */
	protected queryWithCache<A, E, R>(
		queryString: string,
		params: any[],
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
				const { tables, key, isTag, autoInvalidate, config } = cacheStrat;
				const fromCache: any[] | undefined = yield* cache!.get(
					key,
					tables,
					isTag,
					autoInvalidate,
				);

				if (typeof fromCache !== 'undefined') return fromCache as unknown as A;

				const result = yield* query;

				yield* cache!.put(
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

export abstract class MySqlEffectSession<
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlSession {
	static override readonly [entityKind]: string = 'MySqlEffectSession';

	constructor(dialect: MySqlDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): MySqlEffectPreparedQuery<T, TEffectHKT>;

	override execute<T>(query: SQL) {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
			'raw',
		).execute();
	}

	override arrays<T>(query: SQL) {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'arrays',
		).execute();
	}

	override objects<T>(query: SQL) {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'objects',
		).execute();
	}

	abstract transaction<A, E, R>(
		transaction: (
			tx: MySqlEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
		config?: MySqlTransactionConfig,
	): Effect.Effect<A, E | SqlError, R>;
}

export abstract class MySqlEffectTransaction<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlEffectDatabase<TEffectHKT, TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'MySqlEffectTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlEffectSession<TEffectHKT, any, any>,
		protected relations: TRelations,
		protected readonly nestedIndex = 0,
	) {
		super(dialect, session, relations);
	}

	rollback() {
		return new EffectTransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<A, E, R>(
		transaction: (
			tx: MySqlEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R>;
}

export const migrate = Effect.fn('migrate')(function*<TEffectHKT extends QueryEffectHKTBase>(
	migrations: MigrationMeta[],
	session: MySqlEffectSession<TEffectHKT>,
	config: Omit<MigrationConfig, 'migrationsSchema'>,
) {
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

	const { newDb } = yield* upgradeIfNeeded(migrationsTable, session, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash TEXT NOT NULL,
				created_at BIGINT,
				name TEXT,
				applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)
		`;
		yield* session.execute(migrationTableCreate);
	}

	const dbMigrations = yield* session.objects<{
		id: number;
		hash: string;
		created_at: string;
		name: string | null;
	}>(
		sql`select id, hash, created_at, name from ${sql.identifier(migrationsTable)}`,
	);

	if (typeof config === 'object' && config.init) {
		if (dbMigrations.length) {
			return yield* new MigratorInitError({ exitCode: 'databaseMigrations' });
		}

		if (migrations.length > 1) {
			return yield* new MigratorInitError({ exitCode: 'localMigrations' });
		}

		const [migration] = migrations;

		if (!migration) return;

		yield* session.execute(
			sql`insert into ${
				sql.identifier(
					migrationsTable,
				)
			} (\`hash\`, \`created_at\`, \`name\`) values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({
		localMigrations: migrations,
		dbMigrations,
	});

	yield* session.transaction((tx) =>
		Effect.gen(function*() {
			for (const migration of migrationsToRun) {
				for (const stmt of migration.sql) {
					yield* tx.execute(sql.raw(stmt));
				}
				yield* tx.execute(
					sql`insert into ${
						sql.identifier(
							migrationsTable,
						)
					} (\`hash\`, \`created_at\`, \`name\`) values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
				);
			}
		})
	);
});
