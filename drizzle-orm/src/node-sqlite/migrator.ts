import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { NodeSQLiteDatabase } from './driver.ts';

export function migrate<TRelations extends AnyRelations = EmptyRelations>(
	db: NodeSQLiteDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session, config);
}
