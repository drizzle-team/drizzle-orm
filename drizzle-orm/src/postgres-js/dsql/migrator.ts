import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as coreMigrate } from '~/pg-core/async/dsql/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { PostgresJsDsqlDatabase } from './driver.ts';

/** DSQL transactions don't support >1 DDL statements - rollbacks on failure must be done manually */
export async function migrate<TRelations extends AnyRelations>(
	db: PostgresJsDsqlDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return await coreMigrate(migrations, db, config);
}
