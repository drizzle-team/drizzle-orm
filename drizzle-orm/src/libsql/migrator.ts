import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { LibSQLDatabase } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>>(
	db: LibSQLDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session, config);
}
