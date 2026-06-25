import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { YieldableQuery } from '~/generator-queries/generator.ts';
import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { type Query, type SQL, sql } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { upgradeIfNeeded } from '~/up-migrations/sqlite.ts';

export interface PreparedQueryConfig {
	run: unknown;
	all: unknown;
	get: unknown;
	values: unknown;
	execute: unknown;
}

export interface SQLiteTransactionConfig {
	behavior?: 'deferred' | 'immediate' | 'exclusive';
}

export type SQLiteExecuteMethod = 'run' | 'all' | 'get' | 'values';

export abstract class SQLitePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'SQLiteBasePreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;
	/** @internal */
	readonly executeMethod: SQLiteExecuteMethod;

	constructor(
		executeMethod: SQLiteExecuteMethod,
		protected query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
	) {
		this.mapper = mapper;
		this.executeMethod = executeMethod;
	}

	getQuery(): Query {
		return this.query;
	}

	abstract run(placeholderValues?: Record<string, unknown>): unknown;
	abstract all(placeholderValues?: Record<string, unknown>): unknown;
	abstract get(placeholderValues?: Record<string, unknown>): unknown;
	abstract values(placeholderValues?: Record<string, unknown>): unknown;
	abstract execute(placeholderValues?: Record<string, unknown>): unknown;
}

export abstract class SQLiteSession<TRunResult = unknown, TRelations extends AnyRelations = EmptyRelations> {
	static readonly [entityKind]: string = 'SQLiteSession';

	declare readonly _: {
		readonly runResult: TRunResult;
		readonly relations: TRelations;
	};

	constructor(
		/** @internal */
		readonly dialect: SQLiteDialect,
	) {}

	abstract prepareQuery(
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
	): SQLitePreparedQuery;
}

export function* migrate(
	migrations: MigrationMeta[],
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
) {
	const migrationsTable = config === undefined
		? '__drizzle_migrations'
		: typeof config === 'string'
		? '__drizzle_migrations'
		: (config.migrationsTable ?? '__drizzle_migrations');

	// Detect DB version and upgrade table schema if needed
	const { newDb } = yield* upgradeIfNeeded(
		migrationsTable,
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
		yield* YieldableQuery.silent(migrationTableCreate);
	}

	const dbMigrations = yield* YieldableQuery.withResult<{
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

		yield* YieldableQuery.silent(
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

	const batchQueries: SQL[] = [];

	for (const migration of migrationsToRun) {
		for (const stmt of migration.sql) {
			batchQueries.push(sql.raw(stmt));
		}
		batchQueries.push(
			sql`insert into ${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
				new Date().toISOString()
			})`,
		);
	}

	yield* YieldableQuery.batch(batchQueries);
	return;
}
