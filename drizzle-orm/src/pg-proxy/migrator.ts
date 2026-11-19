import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { runAsyncProgram } from '~/runtime/async.ts';
import { migrate as migrateProgram } from '~/up-migrations/pg-program.ts';
import { proxyMigrationRunner } from '~/up-migrations/utils.ts';
import type { PgRemoteDatabase } from './driver.ts';

export type ProxyMigrator = (migrationQueries: string[]) => Promise<void>;

export function migrate<TRelations extends AnyRelations>(
	db: PgRemoteDatabase<TRelations>,
	callback: ProxyMigrator,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);
	const runner = proxyMigrationRunner(db.dialect, callback, {
		execute: (query) => db.session.execute(query),
		objects: (query) => db.session.objects(query),
	});

	return runAsyncProgram(() => migrateProgram(migrations, runner, config));
}
