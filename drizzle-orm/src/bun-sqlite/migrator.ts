import crypto from 'node:crypto';
import type { MigrationConfig, MigrationMeta, MigratorFromJournalConfig } from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { SQLiteBunDatabase } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations = EmptyRelations>(
	db: SQLiteBunDatabase<TSchema, TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session, config);
}

export function migrateFromJournal<
	TSchema extends Record<string, unknown>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	db: SQLiteBunDatabase<TSchema, TRelations>,
	config: MigratorFromJournalConfig,
) {
	const migrations: MigrationMeta[] = config.migrationsData.map((d) => ({
		sql: d.sql,
		folderMillis: d.timestamp,
		hash: crypto.createHash('sha256').update(d.sql.join('--> statement-breakpoint')).digest('hex'),
		bps: true,
	}));
	return db.dialect.migrate(migrations, db.session, {
		migrationsSchema: config.migrationsSchema,
		migrationsTable: config.migrationsTable,
		init: config.init,
	});
}
