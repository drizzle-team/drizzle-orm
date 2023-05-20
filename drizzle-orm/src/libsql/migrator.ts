import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { LibSQLDatabase } from './driver';

export function migrate<T extends LibSQLDatabase<Record<string, unknown>>>(
	db: T,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session);
}
