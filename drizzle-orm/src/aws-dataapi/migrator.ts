import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { sql } from '~/sql';
import { AwsDataApiPgDatabase } from './driver';
import { AwsDataApiSession } from './session';

export async function migrate(db: AwsDataApiPgDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);

	// Write own aws datapi migrator
	const session = db.session as AwsDataApiSession;

	const migrationTableCreate = sql`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
		id SERIAL PRIMARY KEY,
		hash text NOT NULL,
		created_at bigint
	)`;
	await session.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
	await session.execute(migrationTableCreate);

	const dbMigrations = await session.execute<{ id: number; hash: string; created_at: string }[]>(
		sql`SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
	);

	const lastDbMigration = dbMigrations[0];
	const transactionId = await session.beginTransaction();

	try {
		for await (const migration of migrations) {
			if (
				!lastDbMigration
				|| parseInt(lastDbMigration.created_at, 10) < migration.folderMillis
			) {
				await session.executeWithTransaction(sql.raw(migration.sql), transactionId);
				await session.executeWithTransaction(
					sql`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
					transactionId
				);
			}
		}

		await session.commitTransaction(transactionId!);
	} catch (e) {
		await session.rollbackTransaction(transactionId!);
		throw e;
	}
}