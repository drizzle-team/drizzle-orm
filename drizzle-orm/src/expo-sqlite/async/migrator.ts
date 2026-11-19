import { readMigrationsFromRecord } from '~/migrator.utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { migrateAsync } from '~/sqlite-core/async/session.ts';
import { type MigrationsState, useMigrationsState } from '~/up-migrations/react.ts';
import type { ExpoSQLiteAsyncDatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
}

export async function migrate<TRelations extends AnyRelations = EmptyRelations>(
	db: ExpoSQLiteAsyncDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationsFromRecord(config.migrations);
	return migrateAsync(migrations, db);
}

export const useMigrations = (db: ExpoSQLiteAsyncDatabase<any>, migrations: {
	journal: {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};
	migrations: Record<string, string>;
}): MigrationsState => useMigrationsState(() => migrate(db, migrations as any));
