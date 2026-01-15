import crypto from 'node:crypto';
import fs, { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface KitConfig {
	out: string;
	schema: string;
}

export interface MigrationConfig {
	migrationsFolder: string;
	migrationsTable?: string;
	migrationsSchema?: string;
	/** @internal */
	init?: boolean;
}

export interface MigrationMeta {
	sql: string[];
	folderMillis: number;
	hash: string;
	bps: boolean;
}

export interface MigrationFromJournalConfig {
	migrationsJournal: MigrationsJournal;
	migrationsTable?: string;
}

export type MigrationsJournal = {
	sql: string;
	timestamp: number;
}[];

/** Only gets returned if migrator failed with `init: true` used by `drizzle-kit pull --init`*/
export interface MigratorInitFailResponse {
	exitCode: 'databaseMigrations' | 'localMigrations';
}

/** Only gets returned if migrator failed with `init: true` used by `drizzle-kit pull --init`*/
export interface MigratorInitFailResponse {
	exitCode: 'databaseMigrations' | 'localMigrations';
}

export function formatToMillis(dateStr: string): number {
	const year = parseInt(dateStr.slice(0, 4), 10);
	const month = parseInt(dateStr.slice(4, 6), 10) - 1;
	const day = parseInt(dateStr.slice(6, 8), 10);
	const hour = parseInt(dateStr.slice(8, 10), 10);
	const minute = parseInt(dateStr.slice(10, 12), 10);
	const second = parseInt(dateStr.slice(12, 14), 10);

	return Date.UTC(year, month, day, hour, minute, second);
}

function readMigrationFilesOLD(config: MigrationConfig): MigrationMeta[] {
	const migrationFolderTo = config.migrationsFolder;

	const migrationQueries: MigrationMeta[] = [];

	const journalPath = `${migrationFolderTo}/meta/_journal.json`;

	const journalAsString = fs.readFileSync(journalPath).toString();

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

export function readMigrationFiles(config: MigrationConfig): MigrationMeta[] {
	if (fs.existsSync(`${config.migrationsFolder}/meta/_journal.json`)) {
		// it means user has folders V2
		// we need to warn to up the folders version but still apply migrations
		console.log(
			'\nWarning: We detected that you have old drizzle-kit migration folders. We suggest to upgrade drizzle-kit and run "drizzle-kit up"\n',
		);
		return readMigrationFilesOLD(config);
	}

	const migrationFolderTo = config.migrationsFolder;

	const migrationQueries: MigrationMeta[] = [];

	const migrations = readdirSync(migrationFolderTo)
		.map((subdir) => ({ path: join(migrationFolderTo, subdir, 'migration.sql'), name: subdir }))
		.filter((it) => existsSync(it.path));

	migrations.sort((a, b) => a.name.localeCompare(b.name));

	for (const migration of migrations) {
		const migrationPath = migration.path;
		const migrationDate = migration.name.slice(0, 14);

		const query = fs.readFileSync(migrationPath).toString();

		const result = query.split('--> statement-breakpoint').map((it) => {
			return it;
		});

		const millis = formatToMillis(migrationDate);

		migrationQueries.push({
			sql: result,
			bps: true,
			folderMillis: millis,
			hash: crypto.createHash('sha256').update(query).digest('hex'),
		});
	}

	return migrationQueries;
}
