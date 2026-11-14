import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { ClickHouseDriverDatabase } from './driver.ts';

/**
 * Applies the migrations in `config.migrationsFolder`.
 *
 * ClickHouse has no usable transactions, so migrations are applied statement by statement and a
 * migration is only recorded once all of its statements have succeeded — a failure part-way leaves
 * it unrecorded and it is retried on the next run. Write migrations so that this is safe, e.g. with
 * `CREATE TABLE IF NOT EXISTS`.
 */
export async function migrate<TSchema extends Record<string, unknown>>(
	db: ClickHouseDriverDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	await db.dialect.migrate(migrations, db.session, config);
}
