import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { runAsyncProgram } from '~/runtime/async.ts';
import { migrate as migrateProgram } from '~/up-migrations/sqlite-program.ts';
import { sqliteAsyncMigrationRunner } from '~/up-migrations/sqlite.ts';
import type { DrizzleD1Database } from './driver.ts';

export function migrate<TRelations extends AnyRelations>(
	db: DrizzleD1Database<TRelations>,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);

	// D1 has no interactive transactions: statements apply atomically as one batch, with params inlined
	const runner = sqliteAsyncMigrationRunner(
		db,
		(statements) => db.session.batch(statements.map((statement) => db.run(statement.inlineParams()))),
	);

	return runAsyncProgram(() => migrateProgram(migrations, runner, config));
}
