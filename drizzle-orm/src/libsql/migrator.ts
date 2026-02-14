import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import { CURRENT_MIGRATION_TABLE_VERSION, upgradeAsyncIfNeeded } from '~/up-migrations/sqlite.ts';
import type { LibSQLDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: LibSQLDatabase<TSchema, TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

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
		)
	`;
		await db.session.run(migrationTableCreate);
	}

	const dbMigrations = await db.all<{ id: number; hash: string; created_at: string }>(
		sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)}`,
	);

	if (config.init) {
		if (dbMigrations.length) {
			return { exitCode: 'databaseMigrations' as const };
		}

		if (migrations.length > 1) {
			return { exitCode: 'localMigrations' as const };
		}

		const [migration] = migrations;

		if (!migration) return;

		await db.run(
			sql`insert into ${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name", "version") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${CURRENT_MIGRATION_TABLE_VERSION})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });
	const statementToBatch = [];
	for (const migration of migrationsToRun) {
		for (const stmt of migration.sql) {
			statementToBatch.push(db.run(sql.raw(stmt)));
		}

		statementToBatch.push(
			db.run(
				sql`INSERT INTO ${
					sql.identifier(migrationsTable)
				} ("hash", "created_at", "name", "version") VALUES(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${CURRENT_MIGRATION_TABLE_VERSION})`,
			),
		);
	}

	await db.session.migrate(statementToBatch);

	return;
}
