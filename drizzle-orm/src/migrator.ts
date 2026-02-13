import crypto from 'node:crypto';
import fs, { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { formatToMillis } from './migrator.utils';

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
	name?: string;
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

export function readMigrationFiles(config: MigrationConfig): MigrationMeta[] {
	if (fs.existsSync(`${config.migrationsFolder}/meta/_journal.json`)) {
		// it means user has folders V2
		// we need to warn to up the folders
		console.error(
			'\nError: We detected that you have old drizzle-kit migration folders. You must upgrade drizzle-kit and run "drizzle-kit up"\n',
		);
		process.exit(0);
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
			name: migration.name,
		});
	}

	return migrationQueries;
}
