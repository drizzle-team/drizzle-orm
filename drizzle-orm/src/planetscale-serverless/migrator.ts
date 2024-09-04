import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { PlanetScaleDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: PlanetScaleDatabase<TSchema>,
	config: MigrationConfig | string,
) {
	const migrations = readMigrationFiles(config);

	const preparedConfig = typeof config === 'string'
		? {
			migrationsFolder: config,
		}
		: config;

	await db.dialect.migrate(migrations, db.session, preparedConfig);
}
