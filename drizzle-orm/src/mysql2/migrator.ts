import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { MySql2Database } from './driver';

export async function migrate<
	T extends MySql2Database<Record<string, unknown>>,
>(db: T, config: MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
