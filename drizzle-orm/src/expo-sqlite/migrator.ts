import type { MigrationMeta } from '~/migrator.ts';
import type { ExpoSQLiteDatabase } from './driver.ts';
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';

interface MigrationConfig {
	journal: {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};
	migrations: Record<string, string>;
}

async function readMigrationFiles({ journal, migrations }: MigrationConfig): Promise<MigrationMeta[]> {
	const migrationQueries: MigrationMeta[] = [];

	for await (const journalEntry of journal.entries) {
		const query = migrations[`m${journalEntry.idx.toString().padStart(4, '0')}`];

		if (!query) {
			throw new Error(`Missing migration: ${journalEntry.tag}`);
		}

		try {
			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			migrationQueries.push({
				sql: result,
				bps: journalEntry.breakpoints,
				folderMillis: journalEntry.when,
				hash: await digestStringAsync(CryptoDigestAlgorithm.SHA256, query),
			});
		} catch {
			throw new Error(`Failed to parse migration: ${journalEntry.tag}`);
		}
	}

	return migrationQueries;
}

export async function migrate<TSchema extends Record<string, unknown>>(
	db: ExpoSQLiteDatabase<TSchema>,
	config: MigrationConfig,
) {
	const migrations = await readMigrationFiles(config);
	return db.dialect.migrate(migrations, db.session);
}
