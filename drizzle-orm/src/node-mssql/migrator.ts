import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { NodeMsSqlDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: NodeMsSqlDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return await db.dialect.migrate(migrations, db.session, config);
}
