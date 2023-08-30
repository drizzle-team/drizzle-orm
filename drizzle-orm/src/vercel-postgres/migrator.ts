import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { VercelPgDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: VercelPgDatabase<TSchema>,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
