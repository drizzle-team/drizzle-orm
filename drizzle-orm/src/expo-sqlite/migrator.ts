import { readMigrationsFromRecord } from '~/migrator.utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { migrateSync } from '~/sqlite-core/async/session.ts';
import { type MigrationsState, useMigrationsState } from '~/up-migrations/react.ts';
import type { ExpoSQLiteDatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
}

export async function migrate<TRelations extends AnyRelations = EmptyRelations>(
	db: ExpoSQLiteDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationsFromRecord(config.migrations);
	return migrateSync(migrations, db.session);
}

export const useMigrations = (db: ExpoSQLiteDatabase<any>, migrations: {
	journal: {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};
	migrations: Record<string, string>;
}): MigrationsState => useMigrationsState(() => migrate(db, migrations as any));
