import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import { upgradeAsyncIfNeeded } from '~/up-migrations/sqlite-proxy.ts';
import type { SqliteRemoteDatabase } from './driver.ts';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: SqliteRemoteDatabase<TSchema, TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);

	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeAsyncIfNeeded(migrationsTable, db, callback, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id INTEGER PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric,
			name text,
			applied_at TEXT
		);`;

		await db.run(migrationTableCreate);
	}

	const dbMigrations = (await db.values<[number, string, string, string | null]>(
		sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)}`,
	)).map(([id, hash, created_at, name]) => ({ id, hash, created_at, name }));

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
					sql`insert into ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
						new Date().toISOString()
					})`
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
				sql`insert into ${
					sql.identifier(migrationsTable)
				} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
					new Date().toISOString()
				})`
					.inlineParams(),
			).sql,
		);
	}

	await callback(queriesToRun);

	return;
}

export async function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: SqliteRemoteDatabase<TSchema, TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
	steps: number = 1,
) {
	const migrations = readMigrationFiles(config);
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

	const dbMigrations = await db.values<[number, string, string, string | null]>(
		sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)} ORDER BY id DESC LIMIT ${sql.raw(String(steps))}`,
	);

	if (dbMigrations.length === 0) return;

	const queriesToRun: string[] = [];
	for (const dbMigration of dbMigrations) {
		const meta = migrations.find((m) => m.hash === dbMigration[1] && (!dbMigration[3] || m.name === dbMigration[3]));
		if (!meta) {
			throw new DrizzleError({ message: `Cannot rollback migration with hash ${dbMigration[1]}: migration file not found` });
		}
		if (!meta.downSql || meta.downSql.length === 0) {
			throw new DrizzleError({ message: `Cannot rollback migration ${dbMigration[1]}: no down SQL available.` });
		}
		queriesToRun.push(
			...[...meta.downSql].reverse(),
			db.dialect.sqlToQuery(
				sql`delete from ${sql.identifier(migrationsTable)} where id = ${dbMigration[0]}`.inlineParams(),
			).sql,
		);
	}
	await callback(queriesToRun);
}
