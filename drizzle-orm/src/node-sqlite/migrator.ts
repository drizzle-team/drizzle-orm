import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { migrateSync } from '~/sqlite-core/async/session.ts';
import type { NodeSQLiteDatabase } from './driver.ts';

export function migrate<TRelations extends AnyRelations = EmptyRelations>(
	db: NodeSQLiteDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return migrateSync(migrations, db.session, config);
}
