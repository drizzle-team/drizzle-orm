import { MigrationConfig, readMigrationFiles } from 'drizzle-orm/migrator';
import { DrizzleD1Database } from './driver';

export async function migrate(db: DrizzleD1Database, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
