import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import { upgradeIfNeeded } from '~/up-migrations/pg-proxy.ts';
import type { PgRemoteDatabase } from './driver.ts';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export async function migrate<TRelations extends AnyRelations>(
	db: PgRemoteDatabase<TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);

	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';
	await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);

	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeIfNeeded(migrationsSchema, migrationsTable, db, callback, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint,
			name text,
			applied_at timestamp with time zone DEFAULT now()
		)`;
		await db.session.execute(migrationTableCreate);
	}

	const dbMigrations = await db.execute<{ id: number; hash: string; created_at: string; name: string | null }>(
		sql`select id, hash, created_at, name from ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
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

		await callback(
			[
				db.dialect.sqlToQuery(
					sql`insert into ${sql.identifier(migrationsSchema)}.${
						sql.identifier(migrationsTable)
					} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`
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
				sql`insert into ${sql.identifier(migrationsSchema)}.${
					sql.identifier(migrationsTable)
				} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`
					.inlineParams(),
			).sql,
		);
	}

	await callback(queriesToRun);

	return;
}

export async function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: PgRemoteDatabase<TSchema, TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
	steps: number = 1,
) {
	const migrations = readMigrationFiles(config);
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = config.migrationsSchema ?? 'drizzle';

	const dbMigrations = await db.session.all<{ id: number; hash: string; created_at: string }>(
		sql`select id, hash, created_at from ${sql.identifier(migrationsSchema)}.${
			sql.identifier(migrationsTable)
		} order by id desc limit ${sql.raw(String(steps))}`,
	);

	if (dbMigrations.length === 0) {
		return;
	}

	const queriesToRun: string[] = [];
	for (const dbMigration of dbMigrations) {
		const meta = migrations.find((m) => m.hash === dbMigration.hash);
		if (!meta) {
			throw new DrizzleError({
				message: `Cannot rollback migration with hash ${dbMigration.hash}: migration file not found`,
			});
		}
		if (!meta.downSql || meta.downSql.length === 0) {
			throw new DrizzleError({
				message: `Cannot rollback migration ${dbMigration.hash}: no down SQL available. Add a down.sql file alongside the migration.`,
			});
		}
		queriesToRun.push(
			...[...meta.downSql].reverse(),
			`DELETE FROM "${migrationsSchema}"."${migrationsTable}" WHERE id = ${dbMigration.id}`,
		);
	}

	await callback(queriesToRun);
}
