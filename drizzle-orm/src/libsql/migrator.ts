import type { MigrationConfig} from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { LibSQLDatabase } from './driver';

export function migrate(db: LibSQLDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
