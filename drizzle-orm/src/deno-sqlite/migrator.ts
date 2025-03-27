import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { DenoSQLiteDatabase } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>>(
	db: DenoSQLiteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session, config);
}
