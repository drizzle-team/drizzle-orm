import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { MySqlDatabase } from '~/mysql-core/db';

export async function migrate(db: MySqlDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
