import { MigrationConfig, readMigrationFiles } from '~/migrator';
import { NeonDatabase } from './driver';
import { NeonQueryResultHKT } from './session';

export async function migrate(db: NeonDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
