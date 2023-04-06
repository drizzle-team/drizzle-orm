import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface KitConfig {
	out: string;
	schema: string;
}

export interface MigrationConfig {
	migrationsFolder: string;
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
		throw Error('no migration folder defined');
	}

	const migrationQueries: MigrationMeta[] = [];

	let journalAsString = '';
	try {
		journalAsString = fs.readFileSync(`${migrationFolderTo}/meta/_journal.json`).toString();
	} catch (e) {
		throw Error(`Can't find meta/_journal.json file`);
	}

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
		} catch (e) {
			throw Error(`No file ${migrationPath} found in ${migrationFolderTo} folder`);
		}
	}

	return migrationQueries;
}
