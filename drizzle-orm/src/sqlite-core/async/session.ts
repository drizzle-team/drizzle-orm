import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import {
	type PreparedQueryConfig as BasePreparedQueryConfig,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery,
	SQLiteSession,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { upgradeAsyncIfNeeded, upgradeSyncIfNeeded } from '~/up-migrations/sqlite.ts';
import { assertUnreachable } from '~/utils.ts';
import { SQLiteAsyncDatabase } from './db.ts';

export interface SQLiteAsyncPreparedQueryConfig extends BasePreparedQueryConfig {
	type: 'sync' | 'async';
}

export type ExecuteResult<TType extends 'sync' | 'async', TResult> = TType extends 'async' ? Promise<TResult>
	: ExecuteResultSync<TResult>;

export class ExecuteResultSync<T> extends QueryPromise<T> {
	static override readonly [entityKind]: string = 'ExecuteResultSync';

	constructor(private resultCb: () => T) {
		super();
	}

	override async execute(): Promise<T> {
		return this.resultCb();
	}

	sync(): T {
		return this.resultCb();
	}
}

export type SQLiteQueryExecutors<TType extends 'sync' | 'async'> = Record<
	SQLiteExecuteMethod,
	(params: unknown[]) => Result<TType, any>
>;

export type Result<TKind extends 'sync' | 'async', TResult> = TKind extends 'async' ? Promise<TResult> : TResult;

export class SQLiteAsyncPreparedQuery<T extends SQLiteAsyncPreparedQueryConfig> extends SQLitePreparedQuery {
	static override readonly [entityKind]: string = 'SQLiteAsyncPreparedQuery';

	private fastPath: boolean;

	constructor(
		private resultKind: 'sync' | 'async',
		executeMethod: SQLiteExecuteMethod = 'all',
		protected executors: SQLiteQueryExecutors<T['type']>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
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
		super(executeMethod, query, mapper, mode);

		// it means that no $withCache options were passed and it should be just enabled
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}

		this.fastPath = cacheConfig === undefined && (cache === undefined || is(cache, NoopCache));
	}

	/** @internal */
	protected async queryWithCache<T>(
		queryString: string,
		params: any[],
		executeMethod: SQLiteExecuteMethod,
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
			const { tables, key: _key, isTag, autoInvalidate, config } = cacheStrat;
			const key = `${executeMethod}_${_key}`;

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

	override run(placeholderValues: Record<string, unknown> = {}): Result<T['type'], T['run']> {
		const { query, logger, executors, fastPath, resultKind } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (resultKind === 'sync') {
			try {
				return (<SQLiteQueryExecutors<'sync'>> executors).run(params);
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}
		}

		return fastPath
			? (<SQLiteQueryExecutors<'async'>> executors).run(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, 'run', () => (<SQLiteQueryExecutors<'async'>> executors).run(params));
	}

	override all(placeholderValues: Record<string, unknown> = {}): Result<T['type'], T['all']> {
		const { query, logger, executors, mapper, fastPath, resultKind } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (resultKind === 'sync') {
			let res: any;
			try {
				res = (<SQLiteQueryExecutors<'sync'>> executors).all(params);
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}

			if (!mapper) return res;
			return mapper(res);
		}

		const res = fastPath
			? (<SQLiteQueryExecutors<'async'>> executors).all(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, 'all', () => (<SQLiteQueryExecutors<'async'>> executors).all(params));
		if (!mapper) return res;

		return res.then((rows) => mapper(rows)) as Result<T['type'], T['all']>;
	}

	override get(placeholderValues: Record<string, unknown> = {}): Result<T['type'], T['get']> {
		const { query, logger, executors, mapper, fastPath, resultKind } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (resultKind === 'sync') {
			let res: any;
			try {
				res = (<SQLiteQueryExecutors<'sync'>> executors).get(params);
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}

			if (!res) return undefined as Result<T['type'], T['get']>;
			if (!mapper) return res;

			return mapper([res])[0];
		}

		const res = fastPath
			? (<SQLiteQueryExecutors<'async'>> executors).get(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, 'get', () => (<SQLiteQueryExecutors<'async'>> executors).get(params));

		// Convert potential nulls from drivers to undefined
		if (!mapper) return res.then((row) => row ? row : undefined);

		return res.then((row) => row ? mapper([row])[0] : undefined) as Result<T['type'], T['get']>;
	}

	override values(placeholderValues: Record<string, unknown> = {}): Result<T['type'], T['values']> {
		const { query, logger, executors, fastPath, resultKind } = this;
		const sql = query._sql ? query._sql.join(' ') : query.sql;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(sql, params);

		if (resultKind === 'sync') {
			try {
				return (<SQLiteQueryExecutors<'sync'>> executors).values(params);
			} catch (e) {
				throw new DrizzleQueryError(sql, params, e as Error);
			}
		}

		const res = fastPath
			? (<SQLiteQueryExecutors<'async'>> executors).values(params).catch((e) => {
				throw new DrizzleQueryError(sql, params, e as Error);
			})
			: this.queryWithCache(sql, params, 'values', () => (<SQLiteQueryExecutors<'async'>> executors).values(params));

		return res;
	}

	override execute(placeholderValues?: Record<string, unknown>): ExecuteResult<T['type'], T['execute']> {
		if (this.resultKind === 'async') {
			return this[this.executeMethod](placeholderValues) as ExecuteResult<T['type'], T['execute']>;
		}
		return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues)) as ExecuteResult<
			T['type'],
			T['execute']
		>;
	}
}

export abstract class SQLiteAsyncSession<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteSession<TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteAsyncSession';

	declare readonly dialect: SQLiteDialect;

	constructor(
		dialect: SQLiteDialect,
		protected resultKind: TResultKind,
	) {
		super(dialect);
	}

	abstract override prepareQuery(
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
	): SQLiteAsyncPreparedQuery<SQLiteAsyncPreparedQueryConfig & { type: TResultKind }>;

	abstract transaction<T>(
		transaction: (
			tx: SQLiteAsyncTransaction<TResultKind, TRunResult, TRelations>,
		) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T>;

	run(query: SQL): Result<TResultKind, TRunResult> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'raw', false).run() as Result<
			TResultKind,
			TRunResult
		>;
	}

	objects<T = unknown>(query: SQL): Result<TResultKind, T[]> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'objects', false).all() as Result<
			TResultKind,
			T[]
		>;
	}

	object<T = unknown>(query: SQL): Result<TResultKind, T> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'objects', false).get() as Result<
			TResultKind,
			T
		>;
	}

	arrays<T extends any[] = unknown[]>(
		query: SQL,
	): Result<TResultKind, T[]> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'arrays', false).all() as Result<
			TResultKind,
			T[]
		>;
	}

	array<T extends any[] = unknown[]>(
		query: SQL,
	): Result<TResultKind, T> {
		return this.prepareQuery(this.dialect.sqlToQuery(query), 'arrays', false).get() as Result<
			TResultKind,
			T
		>;
	}
}

export abstract class SQLiteAsyncTransaction<
	TResultType extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteAsyncDatabase<TResultType, TRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteAsyncTransaction';

	constructor(
		resultType: TResultType,
		dialect: SQLiteDialect,
		session: SQLiteAsyncSession<TResultType, TRunResult, TRelations>,
		relations: TRelations,
		protected readonly nestedIndex = 0,
		forbidJsonb?: boolean,
	) {
		super(resultType, dialect, session, relations, forbidJsonb);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}
}

export function migrateSync(
	migrations: MigrationMeta[],
	session: SQLiteAsyncSession<'sync', unknown, AnyRelations>,
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
): void | MigratorInitFailResponse {
	const migrationsTable = config === undefined
		? '__drizzle_migrations'
		: typeof config === 'string'
		? '__drizzle_migrations'
		: (config.migrationsTable ?? '__drizzle_migrations');

	// Detect DB version and upgrade table schema if needed
	const { newDb } = upgradeSyncIfNeeded(migrationsTable, session, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id INTEGER PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric,
				name text,
				applied_at TEXT
			)`;
		session.run(migrationTableCreate);
	}

	const dbMigrations = session.objects<{
		id: number;
		hash: string;
		created_at: string;
		name: string | null;
	}>(
		sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)}`,
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

		session.run(
			sql`insert into ${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
				new Date().toISOString()
			})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({
		localMigrations: migrations,
		dbMigrations,
	});
	session.run(sql`BEGIN`);

	try {
		for (const migration of migrationsToRun) {
			for (const stmt of migration.sql) {
				session.run(sql.raw(stmt));
			}
			session.run(
				sql`INSERT INTO ${
					sql.identifier(migrationsTable)
				} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
					new Date().toISOString()
				})`,
			);
		}

		session.run(sql`COMMIT`);
	} catch (e) {
		session.run(sql`ROLLBACK`);
		throw e;
	}
}

export async function migrateAsync(
	migrations: MigrationMeta[],
	db: SQLiteAsyncDatabase<'async', unknown, AnyRelations>,
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
): Promise<void | MigratorInitFailResponse> {
	const migrationsTable = config === undefined
		? '__drizzle_migrations'
		: typeof config === 'string'
		? '__drizzle_migrations'
		: (config.migrationsTable ?? '__drizzle_migrations');

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeAsyncIfNeeded(
		migrationsTable,
		db,
		migrations,
	);

	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id INTEGER PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric,
				name text,
				applied_at TEXT
			)
		`;
		await db.session.run(migrationTableCreate);
	}

	const dbMigrations = await db.session.objects<{
		id: number;
		hash: string;
		created_at: string;
		name: string | null;
	}>(
		sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)};`,
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

		await db.session.run(
			sql`insert into ${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
				new Date().toISOString()
			})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({
		localMigrations: migrations,
		dbMigrations,
	});
	await db.session.transaction(async (tx) => {
		for (const migration of migrationsToRun) {
			for (const stmt of migration.sql) {
				await tx.run(sql.raw(stmt));
			}
			await tx.run(
				sql`insert into ${
					sql.identifier(migrationsTable)
				} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
					new Date().toISOString()
				})`,
			);
		}
	});
}
