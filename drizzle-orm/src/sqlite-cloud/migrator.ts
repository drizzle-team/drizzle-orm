import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import { CURRENT_MIGRATION_TABLE_VERSION, upgradeAsyncIfNeeded } from '~/up-migrations/sqlite.ts';
import type { SQLiteCloudDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: SQLiteCloudDatabase<TSchema, TRelations>,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);
	const { session } = db;

	const migrationsTable = config === undefined
		? '__drizzle_migrations'
		: typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeAsyncIfNeeded(migrationsTable, session, migrations);

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
		await session.run(migrationTableCreate);
	}

	const dbMigrations = await session.all<{ id: number; hash: string; created_at: string }>(
		sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)}`,
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

		await session.run(
			sql`insert into ${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name", "version") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${CURRENT_MIGRATION_TABLE_VERSION})`
				.inlineParams(),
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });
	await session.run(sql`BEGIN TRANSACTION`);
	try {
		const stmts = sql.join(
			migrationsToRun.reduce(
				(statements, migration) => {
					statements.push(
						sql.raw(migration.sql.join('')),
						sql`INSERT INTO ${
							sql.identifier(migrationsTable)
						} ("hash", "created_at", "name", "version") VALUES(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${CURRENT_MIGRATION_TABLE_VERSION});\n`
							.inlineParams(),
					);

					return statements;
				},
				[] as SQL[],
			),
		);

		await session.run(stmts);

		await session.run(sql`COMMIT`);
	} catch (error) {
		await session.run(sql`ROLLBACK`);
		throw error;
	}
}
