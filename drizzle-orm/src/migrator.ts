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
	sql: string;
	folderMillis: number;
	hash: string;
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

	const files = fs.readdirSync(migrationFolderTo);
	const migrationQueries: MigrationMeta[] = [];
	for (const migrationFolder of files) {
		if (migrationFolder === '.DS_Store') {
			continue;
		}
		const migrationFiles = fs.readdirSync(`${migrationFolderTo}/${migrationFolder}`);
		const migrationFile = migrationFiles.filter((file) => file === 'migration.sql')[0];

		const query = fs
			.readFileSync(`${migrationFolderTo}/${migrationFolder}/${migrationFile}`)
			.toString();

		const year = Number(migrationFolder.slice(0, 4));
		// second param for Date() is month index, that started from 0, so we need
		// to decrement a value for month
		const month = Number(migrationFolder.slice(4, 6)) - 1;
		const day = Number(migrationFolder.slice(6, 8));
		const hour = Number(migrationFolder.slice(8, 10));
		const min = Number(migrationFolder.slice(10, 12));
		const sec = Number(migrationFolder.slice(12, 14));

		const folderAsMillis = Date.UTC(year, month, day, hour, min, sec);
		migrationQueries.push({
			sql: query,
			folderMillis: folderAsMillis,
			hash: crypto.createHash('sha256').update(query).digest('hex'),
		});
	}

	return migrationQueries;
}
