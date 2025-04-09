import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { BunSQLiteDatabase } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>>(
	db: BunSQLiteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session, config);
}
