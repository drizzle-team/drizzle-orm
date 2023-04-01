import type { MigrationConfig} from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { SQLJsDatabase } from './driver';

export function migrate(db: SQLJsDatabase, config: string | MigrationConfig) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session);
}
