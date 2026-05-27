import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { BunSQLiteDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: BunSQLiteDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return await db.dialect.migrate(migrations, db, config);
}
