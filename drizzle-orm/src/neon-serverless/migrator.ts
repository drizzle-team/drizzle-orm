import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { NeonDatabase } from './driver';

export async function migrate<T extends NeonDatabase<Record<string, unknown>>>(
	db: T,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
