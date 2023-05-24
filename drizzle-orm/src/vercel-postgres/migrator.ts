import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { VercelPgDatabase } from './driver';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: VercelPgDatabase<TSchema>,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
