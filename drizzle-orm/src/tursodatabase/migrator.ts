import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrateAsync } from '~/sqlite-core/async/session.ts';
import type { TursoDatabaseDatabase } from './driver-core.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: TursoDatabaseDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return migrateAsync(migrations, db, config);
}
