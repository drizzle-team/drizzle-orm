import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { BetterSQLite3Database } from './driver';

export function migrate<TSchema extends Record<string, unknown>>(
	db: BetterSQLite3Database<TSchema>,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
