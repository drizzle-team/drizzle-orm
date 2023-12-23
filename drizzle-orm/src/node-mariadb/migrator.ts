import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { NodeMariaDbDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: NodeMariaDbDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}