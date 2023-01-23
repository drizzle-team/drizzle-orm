import { MigrationConfig, readMigrationFiles } from 'drizzle-orm/migrator';
import { NeonDatabase } from './driver';
import { NeonQueryResultHKT } from './session';

export async function migrate(db: NeonDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
