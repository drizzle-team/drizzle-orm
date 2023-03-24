import type { MigrationConfig} from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { PostgresJsDatabase } from './driver';

export async function migrate(db: PostgresJsDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
