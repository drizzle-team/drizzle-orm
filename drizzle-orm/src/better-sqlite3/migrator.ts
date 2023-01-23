import { MigrationConfig, readMigrationFiles } from 'drizzle-orm/migrator';
import { BetterSQLite3Database } from './driver';

export function migrate(db: BetterSQLite3Database, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
