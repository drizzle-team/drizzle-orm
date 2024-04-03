import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFilesSync } from '~/migrator.ts';
import type { BetterSQLite3Database } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>>(
	db: BetterSQLite3Database<TSchema>,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFilesSync(config);
	db.dialect.migrate(migrations, db.session, config);
}
