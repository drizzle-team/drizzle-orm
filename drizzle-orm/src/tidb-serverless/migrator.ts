import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { TiDBServerlessDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: TiDBServerlessDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
