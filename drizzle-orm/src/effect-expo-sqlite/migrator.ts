import * as Effect from 'effect/Effect';
import type { MigrationMeta } from '~/migrator.ts';
import { formatToMillis } from '~/migrator.utils.ts';
import type { AnyRelations } from '~/relations.ts';
import { migrate as coreMigrate } from '~/sqlite-core/effect/session.ts';
import type { EffectExpoSQLiteDatabase } from './driver.ts';

interface MigrationConfig {
	journal?: {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};
	migrations: Record<string, string>;
	migrationsTable?: string;
	/** @internal */
	init?: boolean;
}

function readMigrationFiles({ journal, migrations }: MigrationConfig): MigrationMeta[] {
	if (journal) {
		return journal.entries.map((entry) => {
			const key = `m${entry.idx.toString().padStart(4, '0')}`;
			const query = migrations[key] ?? migrations[entry.tag];
			if (!query) {
				throw new Error(`Missing migration: ${entry.tag}`);
			}

			return {
				sql: query.split('--> statement-breakpoint'),
				bps: entry.breakpoints,
				folderMillis: Math.floor(entry.when / 1000) * 1000,
				hash: '',
				name: entry.tag,
			};
		});
	}

	const migrationQueries: MigrationMeta[] = [];

	const sortedMigrations = Object.keys(migrations).sort();

	for (const key of sortedMigrations) {
		const query = migrations[key];
		if (!query) {
			throw new Error(`Missing migration: ${key}`);
		}

		migrationQueries.push({
			sql: query.split('--> statement-breakpoint'),
			bps: true,
			folderMillis: formatToMillis(key.slice(0, 14)),
			hash: '',
			name: key,
		});
	}

	return migrationQueries;
}

export function migrate<TRelations extends AnyRelations>(
	db: EffectExpoSQLiteDatabase<TRelations>,
	config: MigrationConfig,
) {
	return Effect.suspend(() => coreMigrate(readMigrationFiles(config), db.session, config));
}
