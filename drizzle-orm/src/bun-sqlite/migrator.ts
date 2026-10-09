import type {
	MigrationConfig,
	MigrationFromJournalConfig,
	MigrationMeta,
	MigrationsJournal,
	MigratorInitFailResponse,
	RollbackOptions,
	RollbackStep,
} from '~/migrator.ts';
import { readMigrationFiles } from '~/migrator.ts';
import { splitDownSql } from '~/migrator.utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { migrateSync, rollbackSync } from '~/sqlite-core/async/session.ts';
import type { SQLiteBunDatabase } from './driver.ts';

function fromJournal(config: MigrationFromJournalConfig | MigrationsJournal) {
	const journal = Array.isArray(config) ? config : config.migrationsJournal;
	const migrations: MigrationMeta[] = journal.map((d) => ({
		sql: d.sql.split('--> statement-breakpoint'),
		downSql: splitDownSql(d.downSql),
		folderMillis: d.timestamp,
		hash: '',
		bps: true,
		name: d.name,
	}));
	return { migrations, migrationsTable: Array.isArray(config) ? undefined : config.migrationsTable };
}

export function migrate<TRelations extends AnyRelations = EmptyRelations>(
	db: SQLiteBunDatabase<TRelations>,
	config: MigrationConfig,
): void | MigratorInitFailResponse;
export function migrate<TRelations extends AnyRelations = EmptyRelations>(
	db: SQLiteBunDatabase<TRelations>,
	config: MigrationFromJournalConfig | MigrationsJournal,
): void;
export function migrate<TRelations extends AnyRelations = EmptyRelations>(
	db: SQLiteBunDatabase<TRelations>,
	config: MigrationConfig | MigrationFromJournalConfig | MigrationsJournal,
): void | MigratorInitFailResponse {
	if (Array.isArray(config) || 'migrationsJournal' in config) {
		const { migrations, migrationsTable } = fromJournal(config);
		return migrateSync(migrations, db.session, { migrationsTable });
	}

	const migrations = readMigrationFiles(config as MigrationConfig);
	return migrateSync(migrations, db.session, config as MigrationConfig);
}

export function rollback<TRelations extends AnyRelations = EmptyRelations>(
	db: SQLiteBunDatabase<TRelations>,
	config: MigrationConfig,
	options?: RollbackOptions,
): RollbackStep[];
export function rollback<TRelations extends AnyRelations = EmptyRelations>(
	db: SQLiteBunDatabase<TRelations>,
	config: MigrationFromJournalConfig | MigrationsJournal,
	options?: RollbackOptions,
): RollbackStep[];
export function rollback<TRelations extends AnyRelations = EmptyRelations>(
	db: SQLiteBunDatabase<TRelations>,
	config: MigrationConfig | MigrationFromJournalConfig | MigrationsJournal,
	options?: RollbackOptions,
): RollbackStep[] {
	if (Array.isArray(config) || 'migrationsJournal' in config) {
		const { migrations, migrationsTable } = fromJournal(config);
		return rollbackSync(migrations, db.session, { migrationsTable }, options);
	}

	const migrations = readMigrationFiles(config);
	return rollbackSync(migrations, db.session, config, options);
}
