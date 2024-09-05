import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { MySql2Database } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: MySql2Database<TSchema>,
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
