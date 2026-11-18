import type { MigrationConfig, MigratorInitFailResponse } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { runAsyncProgram } from '~/runtime/async.ts';
import { sql } from '~/sql/sql.ts';
import { migrate as migrateProgram } from '~/up-migrations/sqlite-program.ts';
import { sqliteAsyncMigrationRunner } from '~/up-migrations/sqlite.ts';
import type { SQLiteCloudDatabase } from './driver.ts';

export function migrate<TRelations extends AnyRelations>(
	db: SQLiteCloudDatabase<TRelations>,
	config: MigrationConfig,
): Promise<void | MigratorInitFailResponse> {
	const migrations = readMigrationFiles(config);
	const { session } = db;

	// Statements apply atomically as one script between `BEGIN TRANSACTION` and `COMMIT`, rolled back if it fails
	const runner = sqliteAsyncMigrationRunner(db, async (statements) => {
		await session.run(sql`BEGIN TRANSACTION`);
		try {
			const script = statements.map((statement) =>
				db.dialect.sqlToQuery(statement.inlineParams()).sql.trim().replace(/;$/, '')
			).join(';\n');
			await session.run(sql.raw(`${script};`));
			await session.run(sql`COMMIT`);
		} catch (error) {
			await session.run(sql`ROLLBACK`).catch(() => {});
			throw error;
		}
	});

	return runAsyncProgram(() => migrateProgram(migrations, runner, config));
}
