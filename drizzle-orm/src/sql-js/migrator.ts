import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { SQLJsDatabase } from './driver';

export function migrate<T extends SQLJsDatabase<Record<string, unknown>>>(
	db: T,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
