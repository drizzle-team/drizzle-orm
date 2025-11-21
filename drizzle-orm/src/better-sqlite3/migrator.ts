import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { BetterSQLite3Database } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: BetterSQLite3Database<TSchema, TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session, config);
}
