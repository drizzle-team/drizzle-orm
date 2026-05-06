import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { TursoDatabaseServerlessDatabase } from './driver.ts';

export async function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: TursoDatabaseServerlessDatabase<TSchema, TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db, config);
}
