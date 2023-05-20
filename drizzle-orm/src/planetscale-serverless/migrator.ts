import type { MigrationConfig } from '~/migrator';
import { readMigrationFiles } from '~/migrator';
import type { PlanetScaleDatabase } from './driver';

export async function migrate<
	T extends PlanetScaleDatabase<Record<string, unknown>>,
>(db: T, config: MigrationConfig) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
