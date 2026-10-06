import type { MigrationConfig, MigratorInitFailResponse, RollbackOptions, RollbackStep } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun, journalReadError, type JournalRow, planRollback } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import { upgradeAsyncIfNeeded } from '~/up-migrations/sqlite.ts';
import type { SQLiteCloudDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: SQLiteCloudDatabase<TRelations>,
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

	const dbMigrations = await session.objects<{ id: number; hash: string; created_at: string; name: string | null }>(
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
		await session.run(sql`ROLLBACK`).catch(() => {});
		throw error;
	}
}

export async function rollback<TRelations extends AnyRelations>(
	db: SQLiteCloudDatabase<TRelations>,
	config: MigrationConfig,
	options?: RollbackOptions,
): Promise<RollbackStep[]> {
	const migrations = readMigrationFiles(config);
	const { session } = db;
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
	const table = sql.identifier(migrationsTable);

	const dbMigrations = await session.objects<JournalRow>(sql`SELECT id, hash, created_at, name FROM ${table}`)
		.catch((e) => {
			throw journalReadError(migrationsTable, e);
		});

	const plan = planRollback({ localMigrations: migrations, dbMigrations, options });
	if (options?.dryRun || plan.length === 0) return plan;

	await session.run(sql`BEGIN TRANSACTION`);
	try {
		for (const step of plan) {
			for (const stmt of step.downSql) {
				await session.run(sql.raw(stmt));
			}
			await session.run(sql`DELETE FROM ${table} WHERE id = ${step.id}`);
		}
		await session.run(sql`COMMIT`);
	} catch (error) {
		await session.run(sql`ROLLBACK`);
		throw error;
	}
	return plan;
}
