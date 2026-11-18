import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { runAsyncProgram } from '~/runtime/async.ts';
import { migrate as migrateProgram } from '~/up-migrations/sqlite-program.ts';
import { sqliteAsyncMigrationRunner } from '~/up-migrations/sqlite.ts';
import type { LibSQLDatabase } from './driver.ts';

export function migrate<TRelations extends AnyRelations>(
	db: LibSQLDatabase<TRelations>,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);

	// Statements apply atomically through the client's `migrate`, which also turns off foreign key checks for them
	const runner = sqliteAsyncMigrationRunner(
		db,
		(statements) => db.session.migrate(statements.map((statement) => db.run(statement))),
	);

	return runAsyncProgram(() => migrateProgram(migrations, runner, config));
}
