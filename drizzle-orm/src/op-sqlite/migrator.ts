import { readMigrationsFromRecord } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrateAsync } from '~/sqlite-core/async/session.ts';
import { type MigrationsState, useMigrationsState } from '~/up-migrations/react.ts';
import type { OPSQLiteDatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
}

export async function migrate<TRelations extends AnyRelations>(
	db: OPSQLiteDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationsFromRecord(config.migrations);
	return await migrateAsync(migrations, db);
}

export const useMigrations = (db: OPSQLiteDatabase<any>, migrations: {
	migrations: Record<string, string>;
}): MigrationsState => useMigrationsState(() => migrate(db, migrations));
