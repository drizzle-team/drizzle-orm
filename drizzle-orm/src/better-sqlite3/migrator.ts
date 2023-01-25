import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { BetterSQLite3Database } from './driver';

export function migrate(db: BetterSQLite3Database, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
