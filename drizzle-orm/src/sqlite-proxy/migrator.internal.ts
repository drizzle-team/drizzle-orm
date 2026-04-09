import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import { upgradeAsyncIfNeeded } from '~/up-migrations/sqlite.ts';
import type { SqliteRemoteDatabase } from './driver.ts';
import type { ProxyMigrator } from './migrator.ts';

/**
 * - `migrate` - Public API for end users. Uses 'transaction' mode by default
 * - `migrateInternal` - Internal API used by drizzle-kit. Accepts a `mode` parameter
 *
 * Why `mode` parameter exists:
 * - 'transaction':
 * Used by normal sqlite proxy driver
 *
 * - 'run':
 * Executes statements individually without transaction. Required for Drizzle Kit D1 migrate, which uses sqlite proxy to run statements
 * @see "drizzle-kit/src/cli/connections.ts"
 */
export async function migrateInternal<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: SqliteRemoteDatabase<TSchema, TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
	mode: 'transaction' | 'run',
) {
	const migrations = readMigrationFiles(config);

	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeAsyncIfNeeded(migrationsTable, db.session, migrations, mode);

	if (newDb) {
		const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id INTEGER PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric,
			name text,
			applied_at TEXT
		);`;

		await db.run(migrationTableCreate);
	}

	const dbMigrations = (await db.values<[number, string, string, string | null]>(
		sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)}`,
	)).map(([id, hash, created_at, name]) => ({ id, hash, created_at, name }));

	if (typeof config === 'object' && config.init) {
		if (dbMigrations.length) {
			return { exitCode: 'databaseMigrations' as const };
		}

		if (migrations.length > 1) {
			return { exitCode: 'localMigrations' as const };
		}

		const [migration] = migrations;

		if (!migration) return;

		await callback(
			[
				db.dialect.sqlToQuery(
					sql`insert into ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
						new Date().toISOString()
					})`
						.inlineParams(),
				).sql,
			],
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });
	const queriesToRun: string[] = [];
	for (const migration of migrationsToRun) {
		queriesToRun.push(
			...migration.sql,
			db.dialect.sqlToQuery(
				sql`insert into ${
					sql.identifier(migrationsTable)
				} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
					new Date().toISOString()
				})`
					.inlineParams(),
			).sql,
		);
	}

	await callback(queriesToRun);

	return;
}
