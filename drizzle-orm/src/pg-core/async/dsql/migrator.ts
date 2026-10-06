import { DrizzleError } from '~/errors.ts';
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

/**
 * DSQL transactions allow only one DDL statement and can't mix DDL with DML, so this rollback is not atomic.
 * Every migration's down SQL is resolved before anything runs; a statement failing mid-way must be repaired manually.
 */
export async function rollback(
	migrations: MigrationMeta[],
	db: DsqlAsyncDatabase<PgQueryResultHKT, any>,
	config: string | MigrationConfig,
	steps: number = 1,
): Promise<void> {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';
	const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

	const dbMigrations = await db.session.objects<{ id: number; hash: string; name: string | null }>(
		sql`select id, hash, name from ${table} order by id desc limit ${sql.raw(String(steps))}`,
	);

	const plan = dbMigrations.map((dbMigration) => {
		const meta = migrations.find((m) =>
			m.hash === dbMigration.hash && (!dbMigration.name || m.name === dbMigration.name)
		);
		if (!meta) {
			throw new DrizzleError({
				message: `Cannot rollback migration with hash ${dbMigration.hash}: migration file not found`,
			});
		}
		if (!meta.downSql || meta.downSql.length === 0) {
			throw new DrizzleError({
				message:
					`Cannot rollback migration ${dbMigration.hash}: no down SQL available. Add a down.sql file alongside the migration.`,
			});
		}
		return { id: dbMigration.id, downSql: meta.downSql };
	});

	for (const { id, downSql } of plan) {
		for (const stmt of downSql) {
			await db.execute(sql.raw(stmt));
		}
		await db.execute(sql`delete from ${table} where id = ${id}`);
	}
}
