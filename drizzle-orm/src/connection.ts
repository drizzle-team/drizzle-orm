import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type MigrationMeta = { sql: string; folderMillis: number; hash: string };

export interface Session<TQueryParam, TQueryResponse> {
	query(query: string, params: TQueryParam[]): TQueryResponse;
}

export interface Logger {
	logQuery(query: string, params: unknown[]): void;
}

export class DefaultLogger implements Logger {
	logQuery(query: string, params: unknown[]): void {
		console.log(`Executing query:\n${query}\nParams:\n${JSON.stringify(params, null, 2)}\n`);
	}
}

export class NoopLogger implements Logger {
	logQuery(): void {}
}

export interface Driver<TSession> {
	connect(): Promise<TSession>;
}

export interface Dialect<TSession, TDatabase> {
	createDB(session: TSession): TDatabase;

	migrate(migrations: MigrationMeta[], session: TSession): Promise<void>;
}

export interface Connector<TSession, TOperations> {
	dialect: Dialect<TSession, TOperations>;
	driver: Driver<TSession>;
}

export async function connect<TSession, TDatabase>(connector: Connector<TSession, TDatabase>): Promise<TDatabase> {
	const session = await connector.driver.connect();
	return connector.dialect.createDB(session);
}

export interface KitConfig {
	out: string;
	schema: string;
}

export interface MigrationConfig {
	migrationsFolder: string;
}

export async function migrate<TSession, TDatabase>(
	connector: Connector<TSession, TDatabase>,
	config: string,
): Promise<void>;
export async function migrate<TSession, TDatabase>(
	connector: Connector<TSession, TDatabase>,
	config: MigrationConfig,
): Promise<void>;
export async function migrate<TSession extends Session<any, any>, TDatabase>(
	connector: Connector<TSession, TDatabase>,
	config: string | MigrationConfig,
) {
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

	const session = await connector.driver.connect();
	await connector.dialect.migrate(migrationQueries, session);
}
