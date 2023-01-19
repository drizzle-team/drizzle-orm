import { MigrationConfig, readMigrationFiles } from 'drizzle-orm/migrator';
import { SQLJsDatabase } from './driver';

export function migrate(db: SQLJsDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
