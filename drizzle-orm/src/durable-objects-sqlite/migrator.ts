import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import type { DurableObjectSQLiteDatabase } from './driver.ts';
import { sql } from '~/sql/sql.ts';

export function migrate<TSchema extends Record<string, unknown>>(
	db: DurableObjectSQLiteDatabase<TSchema>,
	migrations: MigrationMeta[],
	config?: Pick<MigrationConfig, 'migrationsTable'>,
) {
	const migrationsTable = config?.migrationsTable ?? '__drizzle_migrations';

	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)
	`;
	db.run(migrationTableCreate);

	const dbMigrations = db.values<[number, string, string]>(
		sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`,
	);

	const lastDbMigration = dbMigrations[0] ?? undefined;
	db.transaction(() => {
		for (const migration of migrations) {
			if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
				for (const stmt of migration.sql) {
					db.run(sql.raw(stmt));
				}
				db.run(
					sql`INSERT INTO ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
				);
			}
		}
	});
}
