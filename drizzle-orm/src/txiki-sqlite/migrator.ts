import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { TxikiSQLiteDatabase } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>>(
	db: TxikiSQLiteDatabase<TSchema>,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session, config);
}
