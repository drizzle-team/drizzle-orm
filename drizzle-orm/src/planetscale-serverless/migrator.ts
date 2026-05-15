import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { PlanetScaleDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: PlanetScaleDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session, config);
}
