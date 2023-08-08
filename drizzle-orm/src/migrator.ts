import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface KitConfig {
	out: string;
	schema: string;
}

export interface MigrationConfig {
	migrationsFolder: string;
	migrationsTable?: string;
}

export interface MigrationMeta {
	sql: string[];
	folderMillis: number;
	hash: string;
	bps: boolean;
}

export function readMigrationFiles(config: string | MigrationConfig): MigrationMeta[] {
	let migrationFolderTo: string | undefined;
	if (typeof config === 'string') {
		const configAsString = fs.readFileSync(path.resolve('.', config), 'utf8');
		const jsonConfig = JSON.parse(configAsString) as KitConfig;
		migrationFolderTo = jsonConfig.out;
	} else {
		migrationFolderTo = config.migrationsFolder;
	}

	if (!migrationFolderTo) {
		throw new Error('no migration folder defined');
	}

	const migrationQueries: MigrationMeta[] = [];

	const journalPath = `${migrationFolderTo}/meta/_journal.json`;
	if (!fs.existsSync(journalPath)) {
		throw new Error(`Can't find meta/_journal.json file`);
	}

	const journalAsString = fs.readFileSync(`${migrationFolderTo}/meta/_journal.json`).toString();

	const journal = JSON.parse(journalAsString) as {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};

	for (const journalEntry of journal.entries) {
		const migrationPath = `${migrationFolderTo}/${journalEntry.tag}.sql`;

		try {
			const query = fs.readFileSync(`${migrationFolderTo}/${journalEntry.tag}.sql`).toString();

			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			migrationQueries.push({
				sql: result,
				bps: journalEntry.breakpoints,
				folderMillis: journalEntry.when,
				hash: crypto.createHash('sha256').update(query).digest('hex'),
			});
		} catch {
			throw new Error(`No file ${migrationPath} found in ${migrationFolderTo} folder`);
		}
	}

	return migrationQueries;
}
