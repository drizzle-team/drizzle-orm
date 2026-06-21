import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { migrate as coreMigrate } from '~/mysql-core/async/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { BunMySqlDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: BunMySqlDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return coreMigrate(migrations, db, config);
}
