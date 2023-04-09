import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { AwsDataApiPgDatabase } from './driver';

export async function migrate(db: AwsDataApiPgDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
