import { formatToMillis, type MigrationMeta } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/index.ts';
import type { DrizzleSqliteDODatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
}

function readMigrationFiles({ migrations }: MigrationConfig): MigrationMeta[] {
	const migrationQueries: MigrationMeta[] = [];

	const sortedMigrations = Object.keys(migrations).sort();

	for (const key of sortedMigrations) {
		const query = migrations[key];
		if (!query) {
			throw new Error(`Missing migration: ${key}`);
		}

		try {
			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			const migrationDate = formatToMillis(key.slice(0, 14));

			migrationQueries.push({
				sql: result,
				bps: true,
				folderMillis: migrationDate,
				hash: '',
			});
		} catch {
			throw new Error(`Failed to parse migration: ${key}`);
		}
	}

	return migrationQueries;
}

export async function migrate<
	TSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
>(
	db: DrizzleSqliteDODatabase<TSchema, TRelations>,
	config: MigrationConfig,
): Promise<void> {
	const migrations = readMigrationFiles(config);

	db.transaction((tx) => {
		try {
			const migrationsTable = '__drizzle_migrations';

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
		} catch (error: any) {
			tx.rollback();
			throw error;
		}
	});
}
