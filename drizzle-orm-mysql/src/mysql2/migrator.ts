import { MigrationConfig, readMigrationFiles } from 'drizzle-orm/migrator';
import { MySqlDatabase } from '~/db';

export async function migrate(db: MySqlDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
