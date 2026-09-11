import type { MigrationMeta } from '~/migrator.ts';
import { formatToMillis } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrateAsync } from '~/sqlite-core/async/session.ts';
import type { TursoDatabaseDatabase } from './driver-core.ts';

interface MigrationConfig {
	migrations: Record<string, string>;
	migrationsTable?: string;
	/** @internal */
	init?: boolean;
}

function readMigrationFiles({ migrations }: MigrationConfig): MigrationMeta[] {
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

			migrationQueries.push({
				sql: result,
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
