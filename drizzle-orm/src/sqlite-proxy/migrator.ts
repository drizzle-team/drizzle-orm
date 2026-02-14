import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import { CURRENT_MIGRATION_TABLE_VERSION, upgradeAsyncIfNeeded } from '~/up-migrations/sqlite.ts';
import type { SqliteRemoteDatabase } from './driver.ts';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: SqliteRemoteDatabase<TSchema, TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);

	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeAsyncIfNeeded(migrationsTable, db.session, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id INTEGER PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric,
			name text,
			version integer,
			applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
					} ("hash", "created_at", "name", "version") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${CURRENT_MIGRATION_TABLE_VERSION})`
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
				} ("hash", "created_at", "name", "version") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${CURRENT_MIGRATION_TABLE_VERSION})`,
			).sql,
		);
	}

	await callback(queriesToRun);

	return;
}
