import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type MigrationMeta = { sql: string; folderMillis: number; hash: string };

export interface Logger {
	logQuery(query: string, params: unknown[]): void;
}

export interface LogWriter {
	write(message: string): void;
}

export class ConsoleLogWriter implements LogWriter {
	write(message: string) {
		console.log(message);
	}
}

export class DefaultLogger implements Logger {
	readonly writer: LogWriter;

	constructor(config: { writer: LogWriter } = { writer: new ConsoleLogWriter() }) {
		this.writer = config.writer;
	}

	logQuery(query: string, params: unknown[]): void {
		const stringifiedParams = params.map((p) => {
			try {
				return JSON.stringify(p);
			} catch (e) {
				return String(p);
			}
		});
		const paramsStr = stringifiedParams.length ? ` -- params: [${stringifiedParams.join(', ')}]` : '';
		this.writer.write(`Query: ${query}${paramsStr}`);
	}
}

export class NoopLogger implements Logger {
	logQuery(): void {}
}

export interface KitConfig {
	out: string;
	schema: string;
}

export interface MigrationConfig {
	migrationsFolder: string;
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

	const files1 = fs.readdirSync(migrationFolderTo);
	const migrationQueries: MigrationMeta[] = [];
	for (const migrationFolder of files1) {
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
