import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import { upgradeAsyncIfNeeded } from '~/up-migrations/sqlite.ts';
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
			applied_at TEXT
		)
	`;
		await db.session.run(migrationTableCreate);
	}

	const dbMigrations = await db.all<{ id: number; hash: string; created_at: string; name: string | null }>(
		sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)}`,
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
			} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
				new Date().toISOString()
			})`,
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
				})`,
			),
		);
	}

	await db.session.migrate(statementToBatch);

	return;
}

export async function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: LibSQLDatabase<TSchema, TRelations>,
	config: MigrationConfig,
	steps: number = 1,
) {
	const migrations = readMigrationFiles(config);
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

	const dbMigrations = await db.values<[number, string, string, string | null]>(
		sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)} ORDER BY id DESC LIMIT ${sql.raw(String(steps))}`,
	);

	if (dbMigrations.length === 0) return;

	const statementToBatch = [];
	for (const dbMigration of dbMigrations) {
		const meta = migrations.find((m) => m.hash === dbMigration[1] && (!dbMigration[3] || m.name === dbMigration[3]));
		if (!meta) {
			throw new DrizzleError({ message: `Cannot rollback migration with hash ${dbMigration[1]}: migration file not found` });
		}
		if (!meta.downSql || meta.downSql.length === 0) {
			throw new DrizzleError({ message: `Cannot rollback migration ${dbMigration[1]}: no down SQL available.` });
		}
		for (const stmt of [...meta.downSql].reverse()) {
			statementToBatch.push(db.run(sql.raw(stmt)));
		}
		statementToBatch.push(db.run(sql`DELETE FROM ${sql.identifier(migrationsTable)} WHERE id = ${dbMigration[0]}`));
	}

	await db.session.migrate(statementToBatch);
}
