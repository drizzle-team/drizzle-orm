import type { MigrationMeta } from '~/migrator.ts';
import { formatToMillis } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrate as coreMigrate, rollback as coreRollback } from '~/sqlite-core/effect/session.ts';
import type { EffectSQLiteWasmDatabase } from './driver.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
	downMigrations?: Record<string, string>;
	migrationsTable?: string;
	/** @internal */
	init?: boolean;
}

function readMigrationFiles({ migrations, downMigrations }: MigrationConfig): MigrationMeta[] {
	const migrationQueries: MigrationMeta[] = [];

	const sortedMigrations = Object.keys(migrations).sort();

	for (const key of sortedMigrations) {
		const query = migrations[key];
		if (!query) {
			throw new Error(`Missing migration: ${key}`);
		}

		try {
			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			const migrationDate = formatToMillis(key.slice(0, 14));

			let downSql: string[] | undefined;
			const downQuery = downMigrations?.[key];
			if (downQuery?.trim()) {
				downSql = downQuery.trim().split('--> statement-breakpoint').map((it) => it);
			}

			migrationQueries.push({
				sql: result,
				downSql,
				bps: true,
				folderMillis: migrationDate,
				hash: '',
				name: key,
			});
		} catch {
			throw new Error(`Failed to parse migration: ${key}`);
		}
	}

	return migrationQueries;
}

export function migrate<TRelations extends AnyRelations>(
	db: EffectSQLiteWasmDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return coreMigrate(migrations, db.session, config);
}

export function rollback<TRelations extends AnyRelations>(
	db: EffectSQLiteWasmDatabase<TRelations>,
	config: MigrationConfig,
	steps?: number,
) {
	const migrations = readMigrationFiles(config);
	return coreRollback(migrations, db.session, config, steps);
}
