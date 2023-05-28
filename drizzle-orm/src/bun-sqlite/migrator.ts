import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { BunSQLiteDatabase } from './driver';

export function migrate<TSchema extends Record<string, unknown>>(
	db: BunSQLiteDatabase<TSchema>,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
