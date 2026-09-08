import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrateSync } from '~/sqlite-core/async/session.ts';
import type { BetterSQLite3Database } from './driver.ts';

export function migrate<TRelations extends AnyRelations>(
	db: BetterSQLite3Database<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return migrateSync(migrations, db.session, config);
}
