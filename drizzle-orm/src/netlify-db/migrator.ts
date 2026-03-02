import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { sql } from '~/sql/sql.ts';
import type { NodePgDatabase } from '../node-postgres/driver.ts';
import type { NetlifyDbDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: NetlifyDbDatabase<TSchema> | NodePgDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = config.migrationsSchema ?? 'drizzle';
	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)
	`;

	await db.session.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);
	await db.session.execute(migrationTableCreate);

	const dbMigrations = await db.session.all<{ id: number; hash: string; created_at: string }>(
		sql`select id, hash, created_at from ${sql.identifier(migrationsSchema)}.${
			sql.identifier(migrationsTable)
		} order by created_at desc limit 1`,
	);

	const lastDbMigration = dbMigrations[0];

	await db.transaction(async (tx) => {
		for await (const migration of migrations) {
			if (
				!lastDbMigration
				|| Number(lastDbMigration.created_at) < migration.folderMillis
			) {
				for (const stmt of migration.sql) {
					await tx.execute(sql.raw(stmt));
				}

				await tx.execute(
					sql`insert into ${sql.identifier(migrationsSchema)}.${
						sql.identifier(migrationsTable)
					} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
				);
			}
		}
	});
}
