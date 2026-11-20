import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { runAsyncProgram } from '~/runtime/async.ts';
import { migrate as migrateProgram } from '~/up-migrations/mysql-program.ts';
import { arrayRowsToObjects, proxyMigrationRunner } from '~/up-migrations/utils.ts';
import type { MySqlRemoteDatabase } from './driver.ts';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export function migrate<TRelations extends AnyRelations>(
	db: MySqlRemoteDatabase<TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);
	// Rows are queried as arrays
	const runner = proxyMigrationRunner(db.dialect, callback, {
		execute: (query) => db.session.execute(query),
		objects: async (query, columns) => arrayRowsToObjects(await db.session.arrays<unknown[]>(query), columns),
	});

	return runAsyncProgram(() => migrateProgram(migrations, runner, config));
}
