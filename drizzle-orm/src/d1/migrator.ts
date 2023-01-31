import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { DrizzleD1Database } from './driver';

export async function migrate(db: DrizzleD1Database, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
