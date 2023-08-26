import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { DrizzleD1Database } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>>(
	db: DrizzleD1Database<TSchema>,
	config: string | MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session);
}
