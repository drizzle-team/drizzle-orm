import type { MigrationConfig, MigrationMeta } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { SurrealDBDriverDatabase } from './driver.ts';

async function readMigrations(config: MigrationConfig) {
	return readMigrationFiles(config);
}

export async function migrate(db: SurrealDBDriverDatabase<any>, config: MigrationConfig) {
	const migrations = readMigrationFiles(config);

	for (const migration of migrations) {
		await db.execute(migration.sql as any);
	}
}
