import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface KitConfig {
	out: string;
	schema: string;
}

export interface MigrationConfig {
	migrationsFolder: string;
	migrationsTable?: string;
	migrationsSchema?: string;
}

export interface MigrationMeta {
	sql: string[];
	folderMillis: number;
	hash: string;
	bps: boolean;
}

export async function* readMigrationFiles(config: string | MigrationConfig): AsyncIterableIterator<MigrationMeta> {
	let migrationFolderTo: string | undefined;
	if (typeof config === 'string') {
		const configAsString = await fs.readFile(path.resolve('.', config), 'utf8');
		const jsonConfig = JSON.parse(configAsString) as KitConfig;
		migrationFolderTo = jsonConfig.out;
	} else {
		migrationFolderTo = config.migrationsFolder;
	}

	if (!migrationFolderTo) {
		throw new Error('no migration folder defined');
	}

	let journalAsString: string
	try {
		journalAsString = await fs.readFile(`${migrationFolderTo}/meta/_journal.json`).toString();
	} catch {
		throw new Error(`Can't find meta/_journal.json file`);
	}

	const journal = JSON.parse(journalAsString) as {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};

	for (const journalEntry of journal.entries) {
		const migrationPath = `${migrationFolderTo}/${journalEntry.tag}.sql`;

		try {
			const query = await fs.readFile(`${migrationFolderTo}/${journalEntry.tag}.sql`).toString();

			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			yield {
				sql: result,
				bps: journalEntry.breakpoints,
				folderMillis: journalEntry.when,
				hash: crypto.createHash('sha256').update(query).digest('hex'),
			};
		} catch {
			throw new Error(`No file ${migrationPath} found in ${migrationFolderTo} folder`);
		}
	}
}

export function* readMigrationFilesSync(config: string | MigrationConfig): IterableIterator<MigrationMeta> {
	let migrationFolderTo: string | undefined;
	if (typeof config === 'string') {
		const configAsString = readFileSync(path.resolve('.', config), 'utf8');
		const jsonConfig = JSON.parse(configAsString) as KitConfig;
		migrationFolderTo = jsonConfig.out;
	} else {
		migrationFolderTo = config.migrationsFolder;
	}

	if (!migrationFolderTo) {
		throw new Error('no migration folder defined');
	}

	const journalPath = `${migrationFolderTo}/meta/_journal.json`;
	if (!existsSync(journalPath)) {
		throw new Error(`Can't find meta/_journal.json file`);
	}

	const journalAsString = readFileSync(`${migrationFolderTo}/meta/_journal.json`).toString();

	const journal = JSON.parse(journalAsString) as {
		entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
	};

	for (const journalEntry of journal.entries) {
		const migrationPath = `${migrationFolderTo}/${journalEntry.tag}.sql`;

		try {
			const query = readFileSync(`${migrationFolderTo}/${journalEntry.tag}.sql`).toString();

			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			yield {
				sql: result,
				bps: journalEntry.breakpoints,
				folderMillis: journalEntry.when,
				hash: crypto.createHash('sha256').update(query).digest('hex'),
			};
		} catch {
			throw new Error(`No file ${migrationPath} found in ${migrationFolderTo} folder`);
		}
	}
}
