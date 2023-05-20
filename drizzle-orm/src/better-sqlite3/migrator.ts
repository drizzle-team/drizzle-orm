import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { BetterSQLite3Database } from './driver';

export function migrate<
	T extends BetterSQLite3Database<Record<string, unknown>>,
>(db: T, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
