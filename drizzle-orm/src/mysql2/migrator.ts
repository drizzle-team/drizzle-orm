import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { MySql2Database } from './driver';

export async function migrate(db: MySql2Database, config: MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
