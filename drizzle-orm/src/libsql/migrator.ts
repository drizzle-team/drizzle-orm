import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { LibSQLDatabase } from './driver';

export function migrate(db: LibSQLDatabase, config: MigrationConfig) {
	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session);
}
