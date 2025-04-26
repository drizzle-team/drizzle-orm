import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { NeonDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: NeonDatabase<TSchema, TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
