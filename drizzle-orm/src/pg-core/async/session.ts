import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { is } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { hasTelemetry, tracer } from '~/tracing.ts';
import { upgradeIfNeeded } from '~/up-migrations/pg.ts';
import { assertUnreachable } from '~/utils.ts';
import type { PgDialect } from '../dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '../session.ts';
import { PgBasePreparedQuery, PgSession } from '../session.ts';
import { PgAsyncDatabase } from './db.ts';

export class PgAsyncPreparedQuery<T extends PreparedQueryConfig> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgAsyncPreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	private fastPath: boolean;

	constructor(
		protected executor: (params?: unknown[]) => Promise<any>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		protected logger: Logger,
		// cache instance
		protected cache: Cache | undefined,
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

		this.fastPath = cacheConfig === undefined
			&& (cache === undefined || is(cache, NoopCache))
			&& !hasTelemetry;
	}

	override async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const { query, logger, executor, mapper, fastPath } = this;

		if (fastPath) {
			const params = query.params.length === 0
				? query.params
				: fillPlaceholders(query.params, placeholderValues);
			logger.logQuery(query._sql ? query._sql.join(' ') : query.sql, params);
			const res = await executor(params);
			return mapper ? mapper(res) : res;
		}

		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(this.query.params, placeholderValues);
			const { query: { sql }, mapper } = this;

			span?.setAttributes({
				'drizzle.query.text': sql,
				'drizzle.query.params': JSON.stringify(params),
			});

			this.logger.logQuery(sql, params);

			const query = tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
				span?.setAttributes({
					'drizzle.query.text': sql,
					'drizzle.query.params': JSON.stringify(params),
				});

				// return await so tracer captures time accurately
				return await this.queryWithCache(sql, params, () => this.executor(params));
			});

			if (!mapper) return query;

			return query.then((rows) => tracer.startActiveSpan('drizzle.mapResponse', () => mapper(rows as unknown[])));
		});
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
}

export abstract class PgAsyncSession<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgSession {
	static override readonly [entityKind]: string = 'PgAsyncSession';

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
	): PgAsyncPreparedQuery<T>;

	override execute<T>(query: SQL): Promise<T[]> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
					this.dialect.sqlToQuery(query),
					'raw',
					false,
				);
			});

			return prepared.execute();
		});
	}

	override arrays<T>(query: SQL): Promise<T[]> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
					this.dialect.sqlToQuery(query),
					'arrays',
					false,
				);
			});

			return prepared.execute();
		});
	}

	override objects<T>(query: SQL): Promise<T[]> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
					this.dialect.sqlToQuery(query),
					'objects',
					false,
				);
			});

			return prepared.execute();
		});
	}

	abstract transaction<T>(
		transaction: (tx: PgAsyncTransaction<TQueryResult, TRelations>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T>;
}

export abstract class PgAsyncTransaction<
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'PgAsyncTransaction';

	constructor(
		dialect: PgDialect,
		session: PgAsyncSession<any, any>,
		relations: TRelations,
		protected readonly nestedIndex = 0,
		parseRqbJson: boolean | undefined,
	) {
		super(dialect, session, relations, parseRqbJson);
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

	setTransaction(config: PgTransactionConfig): Promise<unknown> {
		return this.session.execute<void>(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
	}

	abstract override transaction: <T>(
		transaction: (tx: PgAsyncTransaction<TQueryResult, TRelations>) => Promise<T>,
	) => Promise<T>;
}

export async function migrate(
	migrations: MigrationMeta[],
	db: PgAsyncDatabase<PgQueryResultHKT, any>,
	config: string | MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';

	await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeIfNeeded(migrationsSchema, migrationsTable, db, migrations);

	// Create table with latest schema (version 1) if this is a new database
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
		await db.execute(migrationTableCreate);
	}

	const dbMigrations = await db.session.objects<{ id: number; hash: string; created_at: string; name: string }>(
		sql`select id, hash, created_at, name from ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
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

		await db.execute(
			sql`insert into ${sql.identifier(migrationsSchema)}.${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${migration.name ?? null})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });
	await db.transaction(async (tx) => {
		for (const migration of migrationsToRun) {
			for (const stmt of migration.sql) {
				await tx.execute(sql.raw(stmt));
			}
			await tx.execute(
				sql`insert into ${sql.identifier(migrationsSchema)}.${
					sql.identifier(migrationsTable)
				} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${
					migration.name ?? null
				})`,
			);
		}
	});
}
