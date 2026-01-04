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
