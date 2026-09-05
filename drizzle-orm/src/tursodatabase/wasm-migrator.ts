import type { MigrationMeta } from '~/migrator.ts';
import { formatToMillis } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrateAsync, rollbackAsync } from '~/sqlite-core/async/session.ts';
import type { TursoDatabaseDatabase } from './driver-core.ts';

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

/** Filesystemless version of migrator for browser environments */
export function migrate<TRelations extends AnyRelations>(
	db: TursoDatabaseDatabase<TRelations>,
	config: MigrationConfig,
) {
	const migrations = readMigrationFiles(config);
	return migrateAsync(migrations, db, config);
}

/** Filesystemless version of rollback for browser environments */
export async function rollback<TRelations extends AnyRelations>(
	db: TursoDatabaseDatabase<TRelations>,
	config: MigrationConfig,
	steps?: number,
) {
	const migrations = readMigrationFiles(config);
	return await rollbackAsync(migrations, db.session as any, config, steps);
}
