import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrateAsync, rollbackAsync } from '~/sqlite-core/async/session.ts';
import type { TursoDatabaseDatabase } from './driver-core.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: TursoDatabaseDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return migrateAsync(migrations, db, config);
}

export async function rollback<TRelations extends AnyRelations>(
	db: TursoDatabaseDatabase<TRelations>,
	config: MigrationConfig,
	steps?: number,
) {
	const migrations = readMigrationFiles(config);
	return await rollbackAsync(migrations, db.session as any, config, steps);
}
