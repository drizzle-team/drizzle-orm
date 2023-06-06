import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { PostgresJsDatabase } from './driver';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: PostgresJsDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
