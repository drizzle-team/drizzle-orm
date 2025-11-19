import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import type { DrizzleD1Database } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: DrizzleD1Database<TSchema, TRelations>,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)
	`;
	await db.session.run(migrationTableCreate);

	const dbMigrations = await db.values<[number, string, string]>(
		sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`,
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
			} ("hash", "created_at") VALUES(${migration.hash}, '${migration.folderMillis}')`.inlineParams(),
		);
		return;
	}

	const lastDbMigration = dbMigrations[0] ?? undefined;
	const statementToBatch = [];
	for (const migration of migrations) {
		if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
			for (const stmt of migration.sql) {
				statementToBatch.push(db.run(sql.raw(stmt)));
			}

			statementToBatch.push(
				db.run(
					sql`INSERT INTO ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at") VALUES(${migration.hash}, '${migration.folderMillis}')`.inlineParams(),
				),
			);
		}
	}

	if (statementToBatch.length > 0) {
		await db.session.batch(statementToBatch);
	}
}
