import { MigrationConfig, readMigrationFiles } from 'drizzle-orm/migrator';
import { NodePgDatabase } from './driver';

export async function migrate(db: NodePgDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
