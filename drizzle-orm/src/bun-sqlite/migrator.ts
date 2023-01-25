import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { BunSQLiteDatabase } from './driver';

export function migrate(db: BunSQLiteDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
