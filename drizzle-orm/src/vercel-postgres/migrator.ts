import type { MigrationConfig} from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { VercelPgDatabase } from './driver';

export async function migrate(db: VercelPgDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
