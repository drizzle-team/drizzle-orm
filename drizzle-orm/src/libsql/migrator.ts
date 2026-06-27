import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrateAsync } from '~/sqlite-core/index.ts';
import type { LibSQLDatabase } from './driver.ts';

export function migrate<TRelations extends AnyRelations>(
	db: LibSQLDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return migrateAsync(migrations, db, config);
}
