import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { SQLJsDatabase } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations = EmptyRelations>(
	db: SQLJsDatabase<TSchema, TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session, config);
}
