import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { NodePgDatabase } from './driver';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: NodePgDatabase<TSchema>,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
