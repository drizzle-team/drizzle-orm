import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as coreMigrate, rollback as coreRollback } from '~/pg-core/async/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { PostgresJsDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: PostgresJsDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return await coreMigrate(migrations, db, config);
}

export async function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: PostgresJsDatabase<TSchema, TRelations>,
	config: MigrationConfig,
	steps?: number,
) {
	const migrations = readMigrationFiles(config);
	return await coreRollback(migrations, db, config, steps);
}
