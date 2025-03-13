import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { Relations } from '~/relations.ts';
import type { BunSQLDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends Relations>(
	db: BunSQLDatabase<TSchema, TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
