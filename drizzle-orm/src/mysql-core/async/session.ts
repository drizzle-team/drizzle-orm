import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { upgradeIfNeeded } from '~/up-migrations/mysql.ts';
import { assertUnreachable } from '~/utils.ts';
import type { MySqlDialect } from '../dialect.ts';
import {
	type AnyMySqlMapper,
	MySqlBasePreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlQueryResultHKT,
	MySqlSession,
	type MySqlTransactionConfig,
} from '../session.ts';
import { MySqlAsyncDatabase } from './db.ts';

export class MySqlAsyncPreparedQuery<T extends MySqlPreparedQueryConfig> extends MySqlBasePreparedQuery {
	static override readonly [entityKind]: string = 'MySqlAsyncPreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	private fastPath: boolean;

	constructor(
		protected executor: (params?: unknown[]) => Promise<any>,
		protected _iterator: ((params?: unknown[]) => AsyncGenerator<any[]>) | undefined,
		query: Query,
		mapper:
			| AnyMySqlMapper
			| undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		protected logger: Logger,
		// cache instance
		private cache: Cache | undefined,
		// per query related metadata
		private queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		private cacheConfig?: WithCacheConfig | undefined,
	) {
		super(query);
		this.mapper = mapper;
		// it means that no $withCache options were passed and it should be just enabled
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}

		this.fastPath = cacheConfig === undefined
			&& (cache === undefined || is(cache, NoopCache));
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

	override async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const { query, logger, executor, mapper, fastPath } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);
		const res = fastPath
			? executor(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, () => executor(params));
		if (!mapper) return res;

		return res.then((rows) => mapper(rows));
	}

	async *iterator(placeholderValues: Record<string, unknown> = {}): AsyncGenerator<T['iterator']> {
		const { query, logger, executor, _iterator, mapper, fastPath } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (_iterator) {
			try {
				if (mapper) {
					for await (const row of _iterator(params)) {
						yield (mapper([row])[0]);
					}

					return;
				}

				for await (const row of _iterator(params)) {
					yield row as Awaited<T['iterator']>;
				}

				return;
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}
		}

		// Fallback for compatibility between drivers
		const rows = await (fastPath
			? executor(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, () => executor(params)));

		if (mapper) {
			for (const row of rows) {
				yield mapper([row])[0];
			}

			return;
		}

		for (const row of rows) {
			yield row;
		}

		return;
	}
}

export abstract class MySqlAsyncSession<
	TQueryResult extends MySqlQueryResultHKT = MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlSession {
	static override readonly [entityKind]: string = 'MySqlAsyncSession';

	abstract override prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): MySqlAsyncPreparedQuery<T>;

	override execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T }>(
			this.dialect.sqlToQuery(query),
			'raw',
		).execute();
	}

	override arrays<T>(query: SQL): Promise<T[]> {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'arrays',
		).execute();
	}

	override objects<T>(query: SQL): Promise<T[]> {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'objects',
		).execute();
	}

	abstract transaction<T>(
		transaction: (
			tx: MySqlAsyncTransaction<TQueryResult, TRelations>,
		) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T>;
}

export abstract class MySqlAsyncTransaction<
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlAsyncDatabase<TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'MySqlAsyncTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlAsyncSession,
		protected relations: TRelations,
		protected readonly nestedIndex: number,
	) {
		super(dialect, session, relations);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<T>(
		transaction: (
			tx: MySqlAsyncTransaction<TQueryResult, TRelations>,
		) => Promise<T>,
	): Promise<T>;
}

export async function migrate(
	migrations: MigrationMeta[],
	db: MySqlAsyncDatabase<MySqlQueryResultHKT, any>,
	config: Omit<MigrationConfig, 'migrationsSchema'>,
): Promise<void | MigratorInitFailResponse> {
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeIfNeeded(
		migrationsTable,
		db.session,
		migrations,
	);

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
		await db.session.execute(migrationTableCreate);
	}

	const dbMigrations = await db.session.objects<{
		id: number;
		hash: string;
		created_at: string;
		name: string | null;
	}>(
		sql`select id, hash, created_at, name from ${sql.identifier(migrationsTable)}`,
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

		await db.session.execute(
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
	await db.transaction(async (tx) => {
		for (const migration of migrationsToRun) {
			for (const stmt of migration.sql) {
				await tx.execute(sql.raw(stmt));
			}
			await tx.execute(
				sql`insert into ${
					sql.identifier(
						migrationsTable,
					)
				} (\`hash\`, \`created_at\`, \`name\`) values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
			);
		}
	});
}
