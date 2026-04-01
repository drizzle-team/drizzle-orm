import type { SqlError } from '@effect/sql/SqlError';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type * as V1 from '~/_relations.ts';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { MigratorInitError } from '~/effect-core/errors.ts';
import { EffectDrizzleQueryError, EffectTransactionRollbackError } from '~/effect-core/errors.ts';
import { EffectLogger } from '~/effect-core/logger.ts';
import type { QueryEffectHKTBase, QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind, is } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { upgradeIfNeeded } from '~/up-migrations/effect-pg.ts';
import { assertUnreachable } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import {
	PgBasePreparedQuery,
	type PgQueryResultHKT,
	PgSession,
	type PgTransactionConfig,
	type PreparedQueryConfig,
} from '../session.ts';
import { PgEffectDatabase } from './db.ts';

export class PgEffectPreparedQuery<
	T extends PreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgEffectPreparedQuery';

	/** @internal */
	readonly mapper: ((rows: any[]) => any) | undefined;

	constructor(
		protected executor: (params?: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		private logger: EffectLogger,
		// cache instance
		protected cache: EffectCache,
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
		return Effect.gen(this, function*() {
			const params = fillPlaceholders(this.query.params, placeholderValues);
			const { query: { sql }, mapper } = this;

			yield* EffectLogger.logQuery(sql, params);

			const query = this.queryWithCache(sql, params, Effect.suspend(() => this.executor(params)));

			if (!mapper) return yield* query;

			return yield* query.pipe(Effect.andThen((rows) => mapper(rows as unknown[])));
		}).pipe(Effect.provideService(EffectLogger, this.logger));
	}

	protected override queryWithCache<A, E, R>(
		queryString: string,
		params: any[],
		query: Effect.Effect<A, E, R>,
	) {
		return Effect.gen(this, function*() {
			const { cacheConfig, queryMetadata } = this;
			const cache = yield* EffectCache;

			const cacheStrat: Awaited<ReturnType<typeof strategyFor>> = cache && !is(cache.cache, NoopCache)
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
			Effect.catchAll((e) => {
				return new EffectDrizzleQueryError({ query: queryString, params, cause: Cause.fail(e) });
			}),
		);
	}
}

export abstract class PgEffectSession<
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> extends PgSession {
	static override readonly [entityKind]: string = 'PgEffectSession';

	constructor(dialect: PgDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgEffectPreparedQuery<T, TEffectHKT>;

	override execute<T>(query: SQL) {
		const prepared = this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'raw',
			false,
		);

		return prepared.execute();
	}

	override arrays<T>(query: SQL) {
		const prepared = this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'arrays',
			false,
		);

		return prepared.execute();
	}

	override objects<T>(query: SQL) {
		const prepared = this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'objects',
			false,
		);

		return prepared.execute();
	}

	abstract transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<TEffectHKT, TQueryResult, TFullSchema, TRelations, TSchema>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R>;
}

export abstract class PgEffectTransaction<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> extends PgEffectDatabase<TEffectHKT, TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'PgEffectTransaction';

	constructor(
		dialect: PgDialect,
		session: PgEffectSession<TEffectHKT, any, any, any, any>,
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

	rollback() {
		return new EffectTransactionRollbackError();
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

	setTransaction(config: PgTransactionConfig) {
		return this.session.execute<void>(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
	}
}

export const migrate = Effect.fn('migrate')(function*<TEffectHKT extends QueryEffectHKTBase>(
	migrations: MigrationMeta[],
	session: PgEffectSession<TEffectHKT>,
	config: string | MigrationConfig,
) {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';

	yield* session.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);

	const { newDb } = yield* upgradeIfNeeded(migrationsSchema, migrationsTable, session, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint,
				name text,
				applied_at timestamp with time zone DEFAULT now()
			)
		`;

		yield* session.execute(migrationTableCreate);
	}

	const dbMigrations = yield* session.objects<{ id: number; hash: string; created_at: string; name: string | null }>(
		sql`select id, hash, created_at, name from ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
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
			sql`insert into ${sql.identifier(migrationsSchema)}.${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });

	yield* session.transaction((tx) =>
		Effect.gen(function*() {
			for (const migration of migrationsToRun) {
				for (const stmt of migration.sql) {
					yield* tx.execute(sql.raw(stmt));
				}
				yield* tx.execute(
					sql`insert into ${sql.identifier(migrationsSchema)}.${
						sql.identifier(migrationsTable)
					} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
				);
			}
		})
	);
});
