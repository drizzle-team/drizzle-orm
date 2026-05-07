import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import { upgradeAsyncIfNeeded } from '~/up-migrations/sqlite.ts';
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
	const { newDb } = await upgradeAsyncIfNeeded(migrationsTable, db, migrations);

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
		await session.run(migrationTableCreate);
	}

	const dbMigrations = await session.all<{ id: number; hash: string; created_at: string; name: string | null }>(
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

		await session.run(
			sql`insert into ${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
				new Date().toISOString()
			})`
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
						} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
							new Date().toISOString()
						});`
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

export async function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: SQLiteCloudDatabase<TSchema, TRelations>,
	config: MigrationConfig,
	steps: number = 1,
) {
	const migrations = readMigrationFiles(config);
	const { session } = db;

	const migrationsTable = config === undefined
		? '__drizzle_migrations'
		: typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';

	const dbMigrations = await session.all<{ id: number; hash: string; created_at: string; name: string | null }>(
		sql`SELECT id, hash, name FROM ${sql.identifier(migrationsTable)} ORDER BY id DESC LIMIT ${sql.raw(String(steps))}`,
	);

	if (dbMigrations.length === 0) return;

	await session.run(sql`BEGIN TRANSACTION`);
	try {
		for (const dbMigration of dbMigrations) {
			const meta = migrations.find((m) => m.hash === dbMigration.hash && (!dbMigration.name || m.name === dbMigration.name));
			if (!meta) {
				throw new DrizzleError({ message: `Cannot rollback migration with hash ${dbMigration.hash}: migration file not found` });
			}
			if (!meta.downSql || meta.downSql.length === 0) {
				throw new DrizzleError({ message: `Cannot rollback migration ${dbMigration.hash}: no down SQL available.` });
			}
			for (const stmt of [...meta.downSql].reverse()) {
				await session.run(sql.raw(stmt));
			}
			await session.run(sql`DELETE FROM ${sql.identifier(migrationsTable)} WHERE id = ${dbMigration.id}`);
		}
		await session.run(sql`COMMIT`);
	} catch (error) {
		await session.run(sql`ROLLBACK`);
		throw error;
	}
}
