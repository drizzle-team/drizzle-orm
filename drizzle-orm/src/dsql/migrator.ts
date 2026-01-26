import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { sql } from '~/sql/sql.ts';
import type { DSQLDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: DSQLDatabase<TSchema>,
	config: MigrationConfig,
): Promise<void> {
	const migrations = readMigrationFiles(config);
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = config.migrationsSchema ?? 'drizzle';

	// Create migrations schema and table if they don't exist
	await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			hash text NOT NULL,
			created_at bigint
		)
	`);

	// Get the last applied migration
	const dbMigrations = await db.execute<{ id: string; hash: string; created_at: string }>(
		sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsSchema)}.${
			sql.identifier(migrationsTable)
		} ORDER BY created_at DESC LIMIT 1`,
	);

	const lastDbMigration = (dbMigrations as any).rows?.[0];

	// Apply migrations without transaction - DSQL doesn't support DDL and DML in the same transaction
	for (const migration of migrations) {
		if (
			!lastDbMigration
			|| Number(lastDbMigration.created_at) < migration.folderMillis
		) {
			// Execute DDL statements
			for (const stmt of migration.sql) {
				if (stmt.trim()) {
					await db.execute(sql.raw(stmt));
				}
			}
			// Record the migration (DML)
			await db.execute(
				sql`INSERT INTO ${sql.identifier(migrationsSchema)}.${
					sql.identifier(migrationsTable)
				} ("hash", "created_at") VALUES (${migration.hash}, ${migration.folderMillis})`,
			);
		}
	}
}
