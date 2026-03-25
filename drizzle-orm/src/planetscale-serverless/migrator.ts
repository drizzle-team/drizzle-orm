import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as coreMigrate } from '~/mysql-core/async/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { PlanetScaleDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: PlanetScaleDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return coreMigrate(migrations, db, config);
}

export async function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: PlanetScaleDatabase<TSchema, TRelations>,
	config: MigrationConfig,
	steps?: number,
) {
	const migrations = readMigrationFiles(config);
	return await db.dialect.rollback(migrations, db.session, config, steps);
}
