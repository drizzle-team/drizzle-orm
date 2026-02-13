import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import { CURRENT_MIGRATION_TABLE_VERSION, upgradeIfNeeded } from '~/up-migrations/mysql.ts';
import type { MySqlRemoteDatabase } from './driver.ts';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: MySqlRemoteDatabase<TSchema, TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);

	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

	// Detect DB version and upgrade table schema if needed
	const { newDb } = await upgradeIfNeeded(migrationsTable, db.session, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash TEXT NOT NULL,
				created_at BIGINT,
				name TEXT,
				applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
				version INT
			)
		`;
		await db.session.execute(migrationTableCreate);
	}

	const dbMigrations = await db.select({
		id: sql.raw('id'),
		hash: sql.raw('hash'),
		created_at: sql.raw('created_at'),
	}).from(sql.identifier(migrationsTable).getSQL()) as { id: number; hash: string; created_at: string }[];

	if (typeof config === 'object' && config.init) {
		if (dbMigrations.length) {
			return { exitCode: 'databaseMigrations' as const };
		}

		if (migrations.length > 1) {
			return { exitCode: 'localMigrations' as const };
		}

		const [migration] = migrations;

		if (!migration) return;

		await callback([
			db.dialect.sqlToQuery(
				sql`insert into ${
					sql.identifier(migrationsTable)
				} (\`hash\`, \`created_at\`, \`name\`, \`version\`) values(${migration.hash}, '${migration.folderMillis}', ${migration.name}, ${CURRENT_MIGRATION_TABLE_VERSION})`
					.inlineParams(),
			).sql,
		]);

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
				} (\`hash\`, \`created_at\`, \`name\`, \`version\`) values(${migration.hash}, '${migration.folderMillis}', ${migration.name}, ${CURRENT_MIGRATION_TABLE_VERSION})`
					.inlineParams(),
			).sql,
		);
	}

	await callback(queriesToRun);
}
