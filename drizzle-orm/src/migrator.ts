import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
}

const timestampToMillis = (timestamp: string) => {
	const year = timestamp.slice(0, 4);
	const month = timestamp.slice(4, 6);
	const day = timestamp.slice(6, 8);
	const hr = timestamp.slice(8, 10);
	const min = timestamp.slice(10, 12);
	const sec = timestamp.slice(12, 14);
	const isoString = `${year}-${month}-${day}T${hr}:${min}:${sec}.000Z`;
	return +new Date(isoString);
};

export function readMigrationFiles(
	config: string | MigrationConfig,
): MigrationMeta[] {
	let outFolder: string | undefined;
	if (typeof config === 'string') {
		const kitConfig = JSON.parse(
			readFileSync(resolve('.', config), 'utf8'),
		) as KitConfig;
		outFolder = kitConfig.out;
	} else {
		outFolder = config.migrationsFolder;
	}

	if (!outFolder) {
		throw new Error('no migration folder defined');
	}

	const migrationQueries: MigrationMeta[] = [];
	const migrationFolders = readdirSync(outFolder).filter((it) => lstatSync(it).isDirectory());
	for (const migrationFolder of migrationFolders) {
		const sqlMigrationPath = join(outFolder, migrationFolder, 'migration.sql');
		if (!existsSync(sqlMigrationPath)) {
			console.error('SQL migration file does not exist:', sqlMigrationPath);
			continue;
		}

		const when = timestampToMillis(migrationFolder.slice(0, 14));

		const query = readFileSync(sqlMigrationPath, 'utf8');
		const result = query.split('--> statement-breakpoint');

		migrationQueries.push({
			sql: result,
			folderMillis: when,
			hash: createHash('sha256').update(query).digest('hex'),
		});
	}

	return migrationQueries;
}
