import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { SQLJsDatabase } from './driver';

export function migrate(db: SQLJsDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
