import type { SqlError } from '@effect/sql/SqlError';
import { Effect } from 'effect';
import type * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import { NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { TaggedDrizzleQueryError, TaggedTransactionRollbackError } from '~/effect-core/errors.ts';
import { entityKind, is } from '~/entity.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import { assertUnreachable } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import type { SelectedFieldsOrdered } from '../query-builders/select.types.ts';
import {
	PgBasePreparedQuery,
	type PgQueryResultHKT,
	PgSession,
	type PgTransactionConfig,
	type PreparedQueryConfig,
} from '../session.ts';
import { PgEffectDatabase } from './db.ts';

export abstract class PgEffectPreparedQuery<T extends PreparedQueryConfig> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgEffectPreparedQuery';

	constructor(
		query: Query,
		private cache: EffectCache | undefined,
		private queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
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

	protected override queryWithCache<T>(
		queryString: string,
		params: any[],
		query: Effect.Effect<T, SqlError>,
	): Effect.Effect<T, TaggedDrizzleQueryError> {
		const { cache, cacheConfig, queryMetadata } = this;
		return Effect.gen(function*() {
			const cacheStrat: Awaited<ReturnType<typeof strategyFor>> = cache && !is(cache.wrapped, NoopCache)
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

				if (typeof fromCache !== 'undefined') return fromCache as unknown as T;

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
		}).pipe(Effect.catchAll((e) => {
			// eslint-disable-next-line @drizzle-internal/no-instanceof
			return Effect.fail(new TaggedDrizzleQueryError(queryString, params, e instanceof Error ? e : undefined));
		}));
	}

	abstract override execute(
		placeholderValues?: Record<string, unknown>,
	): Effect.Effect<T['execute'], TaggedDrizzleQueryError>;

	/** @internal */
	abstract override all(placeholderValues?: Record<string, unknown>): Effect.Effect<T['all'], TaggedDrizzleQueryError>;
}

export abstract class PgEffectSession<
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
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgEffectPreparedQuery<T>;

	abstract override prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): PgEffectPreparedQuery<T>;

	override execute<T>(query: SQL): Effect.Effect<T, TaggedDrizzleQueryError> {
		const { sql, params } = this.dialect.sqlToQuery(query);
		return this.prepareQuery<PreparedQueryConfig & { execute: T }>({ sql, params }, undefined, undefined, false)
			.execute();
	}

	override all<T>(query: SQL): Effect.Effect<T[], TaggedDrizzleQueryError> {
		const { sql, params } = this.dialect.sqlToQuery(query);
		return this.prepareQuery<PreparedQueryConfig & { all: T[] }>({ sql, params }, undefined, undefined, false)
			.all();
	}

	abstract transaction<T>(
		transaction: (
			tx: PgEffectTransaction<TQueryResult, TFullSchema, TRelations, TSchema>,
		) => Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError>,
	): Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError>;
}

export abstract class PgEffectTransaction<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> extends PgEffectDatabase<TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'PgEffectTransaction';

	constructor(
		dialect: PgDialect,
		session: PgEffectSession<any, any, any, any>,
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

	rollback(): Effect.Effect<never, TaggedTransactionRollbackError> {
		return Effect.fail(new TaggedTransactionRollbackError());
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

	setTransaction(config: PgTransactionConfig): Effect.Effect<void, TaggedDrizzleQueryError> {
		return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
	}

	abstract override transaction<T>(
		transaction: (
			tx: PgEffectTransaction<TQueryResult, TFullSchema, TRelations, TSchema>,
		) => Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError>,
	): Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError>;
}

export function migrate(
	migrations: MigrationMeta[],
	session: PgEffectSession,
	config: string | MigrationConfig,
): Effect.Effect<void | MigratorInitFailResponse, TaggedDrizzleQueryError, never> {
	return Effect.gen(function*() {
		const migrationsTable = typeof config === 'string'
			? '__drizzle_migrations'
			: config.migrationsTable ?? '__drizzle_migrations';
		const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint
			)
		`;
		yield* session.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);
		yield* session.execute(migrationTableCreate);

		const dbMigrations = yield* session.all<{ id: number; hash: string; created_at: string }>(
			sql`select id, hash, created_at from ${sql.identifier(migrationsSchema)}.${
				sql.identifier(migrationsTable)
			} order by created_at desc limit 1`,
		);

		if (typeof config === 'object' && config.init) {
			if (dbMigrations.length) {
				return { exitCode: 'databaseMigrations' as const };
			}

			if (migrations.length > 1) {
				return { exitCode: 'localMigrations' as const };
			}

			const [migration] = migrations;

			if (!migration) return;

			yield* session.execute(
				sql`insert into ${sql.identifier(migrationsSchema)}.${
					sql.identifier(migrationsTable)
				} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
			);

			return;
		}

		const lastDbMigration = dbMigrations[0];
		yield* session.transaction((tx) =>
			Effect.gen(function*() {
				for (const migration of migrations) {
					if (
						!lastDbMigration
						|| Number(lastDbMigration.created_at) < migration.folderMillis
					) {
						for (const stmt of migration.sql) {
							yield* tx.execute(sql.raw(stmt));
						}
						yield* tx.execute(
							sql`insert into ${sql.identifier(migrationsSchema)}.${
								sql.identifier(migrationsTable)
							} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
						);
					}
				}
			})
		);

		return;
	}) as Effect.Effect<void | MigratorInitFailResponse, TaggedDrizzleQueryError, never>;
}
