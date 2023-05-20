import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { NodePgDatabase } from './driver';

export async function migrate<
	T extends NodePgDatabase<Record<string, unknown>>,
>(db: T, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
