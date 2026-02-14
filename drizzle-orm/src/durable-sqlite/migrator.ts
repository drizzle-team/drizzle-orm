import type { MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { formatToMillis, getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/index.ts';
import { CURRENT_MIGRATION_TABLE_VERSION, upgradeSyncIfNeeded } from '~/up-migrations/sqlite.ts';
import type { DrizzleSqliteDODatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
	/** @internal */
	init?: boolean;
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

export function migrate<
	TSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
>(
	db: DrizzleSqliteDODatabase<TSchema, TRelations>,
	config: MigrationConfig,
): void | MigratorInitFailResponse {
	const migrations = readMigrationFiles(config);

	return db.transaction((tx) => {
		try {
			const migrationsTable = '__drizzle_migrations';

			const { newDb } = upgradeSyncIfNeeded(migrationsTable, db.session, migrations);

			if (newDb) {
				const migrationTableCreate = sql`
				CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
					id INTEGER PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric,
					name text,
					version integer,
					applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
				)
			`;
				db.run(migrationTableCreate);
			}

			const dbMigrations = (db.values<[number, string, string, string | null]>(
				sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)}`,
			)).map(([id, hash, created_at, name]) => ({ id, hash, created_at, name }));

			if (config.init) {
				if (dbMigrations.length) {
					return { exitCode: 'databaseMigrations' as const };
				}

				if (migrations.length > 1) {
					return { exitCode: 'localMigrations' as const };
				}

				const [migration] = migrations;

				if (!migration) return;

				db.run(
					sql`insert into ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at", "name", "version") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${CURRENT_MIGRATION_TABLE_VERSION})`,
				);

				return;
			}

			const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });
			for (const migration of migrationsToRun) {
				for (const stmt of migration.sql) {
					db.run(sql.raw(stmt));
				}
				db.run(
					sql`INSERT INTO ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
				);
			}

			return;
		} catch (error: any) {
			tx.rollback();
			throw error;
		}
	});
}
