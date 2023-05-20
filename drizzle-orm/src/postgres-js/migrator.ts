import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { PostgresJsDatabase } from './driver';

export async function migrate<
	T extends PostgresJsDatabase<Record<string, unknown>>,
>(db: T, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
