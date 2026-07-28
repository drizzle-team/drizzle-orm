import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as coreMigrate } from '~/pg-core/async/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { PostgresDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: PostgresDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return await coreMigrate(migrations, db, config);
}
