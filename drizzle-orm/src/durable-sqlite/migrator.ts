import type { MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationsFromRecord } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { runSyncProgram } from '~/runtime/sync.ts';
import { migrate as migrateProgram } from '~/up-migrations/sqlite-program.ts';
import { sqliteSyncMigrationRunner } from '~/up-migrations/sqlite.ts';
import type { DrizzleSqliteDODatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
	/** @internal */
	init?: boolean;
}

export function migrate<TRelations extends AnyRelations>(
	db: DrizzleSqliteDODatabase<TRelations>,
	config: MigrationConfig,
): void | MigratorInitFailResponse {
	const migrations = readMigrationsFromRecord(config.migrations);

	// Durable Objects reject `BEGIN`: statements apply atomically in the storage's `transactionSync`
	const runner = sqliteSyncMigrationRunner(db.session, (statements) =>
		db.transaction((tx) => {
			for (const statement of statements) tx.run(statement);
		}));

	return runSyncProgram(() => migrateProgram(migrations, runner, { init: config.init }));
}
