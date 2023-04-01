import type { MigrationConfig} from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { BetterSQLite3Database } from './driver';

export function migrate(db: BetterSQLite3Database, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
