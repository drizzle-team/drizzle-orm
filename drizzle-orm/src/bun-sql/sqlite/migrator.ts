import type { MigrationConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrateAsync } from '~/sqlite-core/async/session.ts';
import type { BunSQLiteDatabase } from './driver.ts';

export async function migrate<TRelations extends AnyRelations>(
	db: BunSQLiteDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return await migrateAsync(migrations, db, config);
}

export async function rollback<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
	db: BunSQLiteDatabase<TSchema, TRelations>,
	config: MigrationConfig,
	steps?: number,
) {
	const migrations = readMigrationFiles(config);
	return await db.dialect.rollback(migrations, db.session, config, steps);
}
