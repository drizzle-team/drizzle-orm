import { DrizzleError } from '~/errors.ts';
import type { MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { formatToMillis, getMigrationsToRun } from '~/migrator.utils.ts';
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

			let downSql: string[] | undefined;
			const downQuery = downMigrations?.[key];
			if (downQuery?.trim()) {
				downSql = downQuery.trim().split('--> statement-breakpoint').map((it) => it);
			}

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

export function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: DrizzleSqliteDODatabase<TSchema, TRelations>,
	config: MigrationConfig,
	steps: number = 1,
): void {
	const migrations = readMigrationFiles(config);

	db.transaction((tx) => {
		try {
			const migrationsTable = '__drizzle_migrations';

			const dbMigrations = db.values<[number, string, string]>(
				sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY id DESC LIMIT ${sql.raw(String(steps))}`,
			);

			if (dbMigrations.length === 0) return;

			for (const dbMigration of dbMigrations) {
				const meta = migrations.find((m) =>
					m.hash ? m.hash === dbMigration[1] : m.folderMillis === Number(dbMigration[2])
				);
				if (!meta) {
					throw new DrizzleError({ message: `Cannot rollback migration with hash ${dbMigration[1]}: migration file not found` });
				}
				if (!meta.downSql || meta.downSql.length === 0) {
					throw new DrizzleError({ message: `Cannot rollback migration ${dbMigration[1]}: no down SQL available.` });
				}
				for (const stmt of [...meta.downSql].reverse()) {
					db.run(sql.raw(stmt));
				}
				db.run(sql`DELETE FROM ${sql.identifier(migrationsTable)} WHERE id = ${dbMigration[0]}`);
			}
		} catch (error: any) {
			tx.rollback();
			throw error;
		}
	});
}
