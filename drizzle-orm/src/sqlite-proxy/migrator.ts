import type { MigrationConfig} from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import { sql } from '~/sql';
import type { SqliteRemoteDatabase } from './driver';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export async function migrate(db: SqliteRemoteDatabase, callback: ProxyMigrator, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);

	const migrationTableCreate = sql`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
		id SERIAL PRIMARY KEY,
		hash text NOT NULL,
		created_at numeric
	)`;

	await db.run(migrationTableCreate);

	const dbMigrations = await db.values<[number, string, string]>(
		sql`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
	);

	const lastDbMigration = dbMigrations[0] ?? undefined;

	try {
		const queriesToRun: string[] = [];
		for (const migration of migrations) {
			if (!lastDbMigration || parseInt(lastDbMigration[2], 10)! < migration.folderMillis) {
				queriesToRun.push(...migration.sql);
				queriesToRun.push(
					`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES('${migration.hash}', '${migration.folderMillis}')`,
				);
			}
		}

		await callback(queriesToRun);
	} catch (e) {
		throw e;
	}
}
