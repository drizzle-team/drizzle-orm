import type {
	MigrationConfig,
	MigrationFromJournalConfig,
	MigrationMeta,
	MigrationsJournal,
	MigratorInitFailResponse,
} from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { SQLiteBunDatabase } from './driver.ts';

export function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations = EmptyRelations>(
	db: SQLiteBunDatabase<TSchema, TRelations>,
	config: MigrationConfig,
): void | MigratorInitFailResponse;
export function migrate<
	TSchema extends Record<string, unknown>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	db: SQLiteBunDatabase<TSchema, TRelations>,
	config: MigrationFromJournalConfig | MigrationsJournal,
): void;
export function migrate<TSchema extends Record<string, unknown>, TRelations extends AnyRelations = EmptyRelations>(
	db: SQLiteBunDatabase<TSchema, TRelations>,
	config: MigrationConfig | MigrationFromJournalConfig | MigrationsJournal,
): void | MigratorInitFailResponse {
	if (Array.isArray(config) || 'migrationsJournal' in config) {
		const journal = Array.isArray(config) ? config : config.migrationsJournal;
		const migrationsTable = Array.isArray(config) ? undefined : config.migrationsTable;

		const migrations: MigrationMeta[] = journal.map((d) => ({
			sql: d.sql.split('--> statement-breakpoint'),
			folderMillis: d.timestamp,
			hash: '',
			bps: true,
		}));

		return db.dialect.migrate(migrations, db.session, {
			migrationsTable,
		});
	}

	const migrations = readMigrationFiles(config as MigrationConfig);
	return db.dialect.migrate(migrations, db.session, config as MigrationConfig);
}
