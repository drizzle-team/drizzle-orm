import { MigrationConfig, readMigrationFiles } from 'drizzle-orm';
import { PgDatabase } from './connector';

export async function migrate(db: PgDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
