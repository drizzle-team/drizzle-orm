import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import type { SQLiteCloudDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: SQLiteCloudDatabase<TSchema, TRelations>,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);
	const { session } = db;

	const migrationsTable = config === undefined
		? '__drizzle_migrations'
		: typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';

	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id INTEGER PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)
	`;
	await session.run(migrationTableCreate);

	const dbMigrations = await session.values<[number, string, string]>(
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

		await session.run(
			sql`insert into ${
				sql.identifier(migrationsTable)
			} ("hash", "created_at") values(${migration.hash}, ${migration.folderMillis})`,
		);

		return;
	}

	const lastDbMigration = dbMigrations[0] ?? undefined;
	await session.run(sql`BEGIN TRANSACTION`);
	try {
		const stmts = sql.join(
			migrations.reduce(
				(statements, migration) => {
					if (!lastDbMigration || Number(lastDbMigration[2])! < migration.folderMillis) {
						statements.push(
							sql.raw(migration.sql.join('')),
							sql`INSERT INTO ${
								sql.identifier(migrationsTable)
							} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis});\n`,
						);
					}

					return statements;
				},
				[] as SQL[],
			),
		);

		await session.run(stmts);

		await session.run(sql`COMMIT`);
	} catch (error) {
		await session.run(sql`ROLLBACK`);
		throw error;
	}
}
