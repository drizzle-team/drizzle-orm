import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { is } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import type { NeonAuthToken } from '~/utils.ts';
import { assertUnreachable } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import type { SelectedFieldsOrdered } from '../query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '../session.ts';
import { PgBasePreparedQuery, PgSession } from '../session.ts';
import { PgAsyncDatabase } from './db.ts';

export abstract class PgAsyncPreparedQuery<T extends PreparedQueryConfig> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgAsyncPreparedQuery';

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

	/** @internal */
	protected authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	abstract override execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	/** @internal */
	abstract override all(placeholderValues?: Record<string, unknown>): Promise<T['all']>;

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
}

export abstract class PgAsyncSession<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> extends PgSession {
	static override readonly [entityKind]: string = 'PgAsyncSession';

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
	): PgAsyncPreparedQuery<T>;

	abstract override prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => T['execute'],
	): PgAsyncPreparedQuery<T>;

	override execute<T>(query: SQL): Promise<T>;
	/** @internal */
	override execute<T>(query: SQL, token?: NeonAuthToken): Promise<T>;
	/** @internal */
	override execute<T>(query: SQL, token?: NeonAuthToken): Promise<T> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
					this.dialect.sqlToQuery(query),
					undefined,
					undefined,
					false,
				);
			});

			return prepared.setToken(token).execute();
		});
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<PreparedQueryConfig & { all: T[] }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).all();
	}

	abstract transaction<T>(
		transaction: (tx: PgAsyncTransaction<TQueryResult, TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T>;
}

export abstract class PgAsyncTransaction<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> extends PgAsyncDatabase<TQueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'PgAsyncTransaction';

	constructor(
		dialect: PgDialect,
		session: PgAsyncSession<any, any, any, any>,
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
		transaction: (tx: PgAsyncTransaction<TQueryResult, TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T>;
}

export async function migrate(
	migrations: MigrationMeta[],
	session: PgAsyncSession,
	config: string | MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
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
	await session.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);
	await session.execute(migrationTableCreate);

	const dbMigrations = await session.all<{ id: number; hash: string; created_at: string }>(
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

		await session.execute(
			sql`insert into ${sql.identifier(migrationsSchema)}.${
				sql.identifier(migrationsTable)
			} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
		);

		return;
	}

	const lastDbMigration = dbMigrations[0];
	await session.transaction(async (tx) => {
		for (const migration of migrations) {
			if (
				!lastDbMigration
				|| Number(lastDbMigration.created_at) < migration.folderMillis
			) {
				for (const stmt of migration.sql) {
					await tx.execute(sql.raw(stmt));
				}
				await tx.execute(
					sql`insert into ${sql.identifier(migrationsSchema)}.${
						sql.identifier(migrationsTable)
					} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
				);
			}
		}
	});
}
