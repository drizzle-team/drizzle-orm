import { DrizzleError } from '~/errors.ts';
import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { sql } from '~/sql/sql.ts';
import { upgradeIfNeeded } from '~/up-migrations/mysql.ts';
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
				applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
			)
		`;
		await db.session.execute(migrationTableCreate);
	}

	const dbMigrations = await db.select({
		id: sql.raw('id'),
		hash: sql.raw('hash'),
		created_at: sql.raw('created_at'),
		name: sql.raw('name'),
	}).from(sql.identifier(migrationsTable).getSQL()) as {
		id: number;
		hash: string;
		created_at: string;
		name: string | null;
	}[];

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
				} (\`hash\`, \`created_at\`, \`name\`) values(${migration.hash}, '${migration.folderMillis}', ${migration.name})`
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
				} (\`hash\`, \`created_at\`, \`name\`) values(${migration.hash}, '${migration.folderMillis}', ${migration.name})`
					.inlineParams(),
			).sql,
		);
	}

	await callback(queriesToRun);
}

export async function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: MySqlRemoteDatabase<TSchema, TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
	steps: number = 1,
) {
	const migrations = readMigrationFiles(config);
	const migrationsTable = config.migrationsTable ?? '__drizzle_migrations';

	const dbMigrations = await db.session.all<{ id: number; hash: string }>(
		sql`select id, hash from ${sql.identifier(migrationsTable)} order by id desc limit ${sql.raw(String(steps))}`,
	);

	if (dbMigrations.length === 0) return;

	const queriesToRun: string[] = [];
	for (const dbMigration of dbMigrations) {
		const meta = migrations.find((m) => m.hash === dbMigration.hash);
		if (!meta) {
			throw new DrizzleError({ message: `Cannot rollback migration with hash ${dbMigration.hash}: migration file not found` });
		}
		if (!meta.downSql || meta.downSql.length === 0) {
			throw new DrizzleError({ message: `Cannot rollback migration ${dbMigration.hash}: no down SQL available.` });
		}
		queriesToRun.push(...[...meta.downSql].reverse(), `DELETE FROM \`${migrationsTable}\` WHERE id = ${dbMigration.id}`);
	}
	await callback(queriesToRun);
}
