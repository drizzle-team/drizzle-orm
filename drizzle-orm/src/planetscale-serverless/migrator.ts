import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { PlanetScaleDatabase } from './driver';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: PlanetScaleDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
