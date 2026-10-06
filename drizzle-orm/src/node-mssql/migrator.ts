import type { MigrationConfig, RollbackOptions } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { NodeMsSqlDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: NodeMsSqlDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return await db.dialect.migrate(migrations, db.session, config);
}

export async function rollback<TRelations extends AnyRelations>(
	db: NodeMsSqlDatabase<TRelations>,
	config: MigrationConfig,
	options?: RollbackOptions,
) {
	const migrations = readMigrationFiles(config);
	return await db.dialect.rollback(migrations, db.session, config, options);
}
