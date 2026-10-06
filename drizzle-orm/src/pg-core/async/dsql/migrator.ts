import type {
	MigrationConfig,
	MigrationMeta,
	MigratorInitFailResponse,
	RollbackOptions,
	RollbackStep,
} from '~/migrator.ts';
import { getMigrationsToRun, journalReadError, type JournalRow, planRollback } from '~/migrator.utils.ts';
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
 * DSQL transactions allow only one DDL statement and can't mix DDL with DML, so this rollback is not atomic:
 * a statement failing mid-way leaves earlier steps applied and must be repaired manually.
 */
export async function rollback(
	migrations: MigrationMeta[],
	db: DsqlAsyncDatabase<PgQueryResultHKT, any>,
	config: string | MigrationConfig,
	options?: RollbackOptions,
): Promise<RollbackStep[]> {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';
	const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

	const dbMigrations = await db.session.objects<JournalRow>(sql`select id, hash, created_at, name from ${table}`)
		.catch((e) => {
			throw journalReadError(`${migrationsSchema}.${migrationsTable}`, e);
		});

	const plan = planRollback({ localMigrations: migrations, dbMigrations, options });
	if (options?.dryRun) return plan;

	for (const step of plan) {
		for (const stmt of step.downSql) {
			await db.execute(sql.raw(stmt));
		}
		await db.execute(sql`delete from ${table} where id = ${step.id}`);
	}
	return plan;
}
