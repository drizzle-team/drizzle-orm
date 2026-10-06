import type { MigrationMeta, MigratorInitFailResponse, RollbackOptions, RollbackStep } from '~/migrator.ts';
import {
	formatToMillis,
	getMigrationsToRun,
	journalReadError,
	type JournalRow,
	planRollback,
	splitDownSql,
} from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/index.ts';
import { upgradeSyncIfNeeded } from '~/up-migrations/sqlite.ts';
import type { DrizzleSqliteDODatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
	downMigrations?: Record<string, string>;
	/** @internal */
	init?: boolean;
}

function readMigrationFiles({ migrations, downMigrations }: MigrationConfig): MigrationMeta[] {
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

			const downSql = splitDownSql(downMigrations?.[key]);

			migrationQueries.push({
				sql: result,
				downSql,
				bps: true,
				folderMillis: migrationDate,
				hash: '',
				name: key,
			});
		} catch {
			throw new Error(`Failed to parse migration: ${key}`);
		}
	}

	return migrationQueries;
}

export function migrate<TRelations extends AnyRelations>(
	db: DrizzleSqliteDODatabase<TRelations>,
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
					applied_at TEXT
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
					} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
						new Date().toISOString()
					})`,
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
					} ("hash", "created_at", "name", "applied_at") VALUES(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
						new Date().toISOString()
					})`,
				);
			}

			return;
		} catch (error: any) {
			tx.rollback();
			throw error;
		}
	});
}

export function rollback<TRelations extends AnyRelations>(
	db: DrizzleSqliteDODatabase<TRelations>,
	config: MigrationConfig,
	options?: RollbackOptions,
): RollbackStep[] {
	const migrations = readMigrationFiles(config);
	const migrationsTable = '__drizzle_migrations';

	let dbMigrations: JournalRow[];
	try {
		dbMigrations = db.values<[number, string, string, string | null]>(
			sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)}`,
		).map(([id, hash, created_at, name]) => ({ id, hash, created_at, name }));
	} catch (e) {
		throw journalReadError(migrationsTable, e);
	}

	const plan = planRollback({ localMigrations: migrations, dbMigrations, options });
	if (options?.dryRun || plan.length === 0) return plan;

	db.transaction(() => {
		for (const step of plan) {
			for (const stmt of step.downSql) {
				db.run(sql.raw(stmt));
			}
			db.run(sql`DELETE FROM ${sql.identifier(migrationsTable)} WHERE id = ${step.id}`);
		}
	});
	return plan;
}
