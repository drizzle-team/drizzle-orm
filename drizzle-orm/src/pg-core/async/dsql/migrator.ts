import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
import { sql } from '~/sql/sql.ts';
import { upgradeIfNeeded } from '~/up-migrations/dsql.ts';
import type { DsqlAsyncDatabase } from './db.ts';

/** DSQL transactions allow only one DDL statement per transaction - rollbacks on failure must be done manually */
export async function migrate(
	migrations: MigrationMeta[],
	db: DsqlAsyncDatabase<PgQueryResultHKT, any>,
	config: string | MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';
	const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

	await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);

	const { newDb } = await upgradeIfNeeded(migrationsSchema, migrationsTable, db, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${table} (
				id integer PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint,
				name text,
				applied_at timestamp with time zone DEFAULT now()
			)
		`;
		await db.execute(migrationTableCreate);
	}

	const dbMigrations = await db.session.objects<{ id: number; hash: string; created_at: string; name: string }>(
		sql`select id, hash, created_at, name from ${table}`,
	);

	// DSQL has no `SERIAL` type, mimic sequence
	let nextId = dbMigrations.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1;

	if (typeof config === 'object' && config.init) {
		if (dbMigrations.length) {
			return { exitCode: 'databaseMigrations' as const };
		}

		if (migrations.length > 1) {
			return { exitCode: 'localMigrations' as const };
		}

		const [migration] = migrations;

		if (!migration) return;

		await db.execute(
			sql`insert into ${table} ("id", "hash", "created_at", "name") values(${nextId}, ${migration.hash}, ${migration.folderMillis}, ${
				migration.name ?? null
			})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });
	for (const migration of migrationsToRun) {
		for (const stmt of migration.sql) {
			await db.execute(sql.raw(stmt));
		}
		await db.execute(
			sql`insert into ${table} ("id", "hash", "created_at", "name") values(${nextId++}, ${migration.hash}, ${migration.folderMillis}, ${
				migration.name ?? null
			})`,
		);
	}
}
