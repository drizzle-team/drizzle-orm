import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache, strategyFor } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { is } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
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

const CURRENT_MIGRATION_TABLE_VERSION = 1;

interface UpgradeResult {
	newDb?: boolean;
	prevVersion?: number;
	currentVersion?: number;
}

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at, version)
 */
async function upgradeIfNeeded(
	migrationsSchema: string,
	migrationsTable: string,
	session: PgAsyncSession,
	localMigrations: MigrationMeta[],
): Promise<UpgradeResult> {
	// Check if the table exists at all
	const tableExists = await session.all<{ exists: boolean }>(
		sql`SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_schema = ${migrationsSchema}
			AND table_name = ${migrationsTable}
		)`,
	);

	if (!tableExists[0]?.exists) {
		return { newDb: true };
	}

	// Table exists, check if there are any rows
	const rows = await session.all<{ id: number; hash: string; created_at: string; version: number | undefined }>(
		sql`SELECT * FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} ORDER BY id ASC LIMIT 1`,
	);

	let prevVersion;

	if (rows.length === 0) {
		// Empty table - check if it has a version column
		const hasVersionColumn = await session.all<{ exists: boolean }>(
			sql`SELECT EXISTS (
				SELECT FROM information_schema.columns
				WHERE table_schema = ${migrationsSchema}
				AND table_name = ${migrationsTable}
				AND column_name = 'version'
			)`,
		);

		prevVersion = hasVersionColumn[0]?.exists ? 1 : 0;
	} else {
		prevVersion = rows[0]?.version ?? 0;
	}

	if (prevVersion < CURRENT_MIGRATION_TABLE_VERSION) {
		await runUpgrades(migrationsSchema, migrationsTable, session, prevVersion, localMigrations);
	}

	return { prevVersion, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}

/**
 * Map of upgrade functions. Each key is the version being upgraded FROM,
 * and the function upgrades the table to the next version.
 */
const upgradeFunctions: Record<
	number,
	(
		migrationsSchema: string,
		migrationsTable: string,
		session: PgAsyncSession,
		localMigrations: MigrationMeta[],
	) => Promise<void>
> = {
	/**
	 * Upgrade from version 0 to version 1:
	 * 1. Add `name` column (text)
	 * 2. Add `applied_at` column (timestamp with time zone, defaults to now())
	 * 3. Add `version` column (integer)
	 * 4. Backfill `name` for existing rows by matching `created_at` (millis) to local migration folder timestamps
	 * 5. If multiple migrations share the same second, use hash matching as a tiebreaker
	 * 6. If hash matching fails, fall back to serial id ordering
	 * 7. Set `version` to 1 on all rows
	 */
	0: async (migrationsSchema, migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

		// 1. Add new columns
		await session.execute(sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS name text`);
		await session.execute(
			sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone DEFAULT now()`,
		);
		await session.execute(sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS version integer`);

		// 2. Read all existing DB migrations
		const dbRows = await session.all<{ id: number; hash: string; created_at: string }>(
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
		);

		if (dbRows.length === 0) {
			return;
		}

		// 3. Sort by millis and if the same - sort by name
		localMigrations.sort((a, b) =>
			a.folderMillis !== b.folderMillis ? a.folderMillis - b.folderMillis : (a.name ?? '').localeCompare(b.name ?? '')
		);

		const byMillis: Record<number, MigrationMeta[]> = {};
		const byHash: Record<string, MigrationMeta> = {};
		for (const lm of localMigrations) {
			if (!byMillis[lm.folderMillis]) {
				byMillis[lm.folderMillis] = [];
			}
			byMillis[lm.folderMillis]!.push(lm);
			byHash[lm.hash] = lm;
		}

		// 4. Match each DB row to a local migration and backfill name
		//    Priority: millis -> hash -> serial position

		for (const dbRow of dbRows) {
			const millis = Number(dbRow.created_at);
			const candidates = byMillis[millis];

			let matched: MigrationMeta | undefined;

			if (candidates && candidates.length === 1) {
				matched = candidates[0];
			} else if (candidates && candidates.length > 1) {
				matched = candidates.find((c) => c.hash === dbRow.hash);
			} else {
				matched = byHash[dbRow.hash];
			}

			await session.execute(
				sql`UPDATE ${table} SET name = ${
					matched?.name ?? null
				}, version = ${1}, applied_at = NULL WHERE id = ${dbRow.id}`,
			);
		}
	},
};

/**
 * Runs all upgrade functions sequentially from `fromVersion` to CURRENT_MIGRATION_TABLE_VERSION.
 */
async function runUpgrades(
	migrationsSchema: string,
	migrationsTable: string,
	session: PgAsyncSession,
	fromVersion: number,
	localMigrations: MigrationMeta[],
): Promise<void> {
	for (let v = fromVersion; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
		const upgradeFn = upgradeFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsSchema, migrationsTable, session, localMigrations);
	}
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

	await session.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeIfNeeded(migrationsSchema, migrationsTable, session, migrations);

	// Create table with latest schema (version 1) if this is a new database
	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint,
				name text,
				applied_at timestamp with time zone DEFAULT now(),
				version integer
			)
		`;
		await session.execute(migrationTableCreate);
	}

	const dbMigrations = await session.all<{ id: number; hash: string; created_at: string; name: string }>(
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

		await session.execute(
			sql`insert into ${sql.identifier(migrationsSchema)}.${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name", "version") values(${migration.hash}, ${migration.folderMillis}, ${
				migration.name ?? null
			}, ${CURRENT_MIGRATION_TABLE_VERSION})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });
	await session.transaction(async (tx) => {
		for (const migration of migrationsToRun) {
			for (const stmt of migration.sql) {
				await tx.execute(sql.raw(stmt));
			}
			await tx.execute(
				sql`insert into ${sql.identifier(migrationsSchema)}.${
					sql.identifier(migrationsTable)
				} ("hash", "created_at", "name", "version") values(${migration.hash}, ${migration.folderMillis}, ${
					migration.name ?? null
				}, ${CURRENT_MIGRATION_TABLE_VERSION})`,
			);
		}
	});
}
