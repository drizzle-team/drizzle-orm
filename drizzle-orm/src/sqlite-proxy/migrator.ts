import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
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

	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)
	`;

	await db.run(migrationTableCreate);

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

		await callback(
			[
				db.dialect.sqlToQuery(
					sql`insert into ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`.inlineParams(),
				).sql,
			],
		);

		return;
	}

	const lastDbMigration = dbMigrations[0] ?? undefined;
	const queriesToRun: string[] = [];
	for (const migration of migrations) {
		if (
			!lastDbMigration
			|| Number(lastDbMigration[2])! < migration.folderMillis
		) {
			queriesToRun.push(
				...migration.sql,
				db.dialect.sqlToQuery(
					sql`insert into ${
						sql.identifier(migrationsTable)
					} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`.inlineParams(),
				).sql,
			);
		}
	}

	await callback(queriesToRun);

	return;
}
