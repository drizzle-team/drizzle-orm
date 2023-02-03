import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { MySql2Database } from './driver';

export async function migrate(db: MySql2Database, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
