import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import { upgradeAsyncIfNeeded } from '~/up-migrations/sqlite.ts';
import type { DrizzleD1Database } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: DrizzleD1Database<TSchema, TRelations>,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

	const { newDb } = await upgradeAsyncIfNeeded(migrationsTable, db, migrations, 'batch');

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

	const dbMigrations = await db.all<{ id: number; hash: string; created_at: string; name: string | null }>(
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

		await db.run(
			sql`INSERT INTO ${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
				new Date().toISOString()
			})`
				.inlineParams(),
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
				} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
					new Date().toISOString()
				})`
					.inlineParams(),
			),
		);
	}

	if (statementToBatch.length > 0) {
		await db.session.batch(statementToBatch);
	}
}
