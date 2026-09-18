import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as coreMigrate, rollback as coreRollback } from '~/pg-core/async/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { PostgresDatabase } from './driver-core.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: PostgresDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return await coreMigrate(migrations, db, config);
}

export async function rollback<TRelations extends AnyRelations>(
	db: PostgresDatabase<TRelations>,
	config: MigrationConfig,
	steps?: number,
) {
	const migrations = readMigrationFiles(config);
	return await coreRollback(migrations, db, config, steps);
}
