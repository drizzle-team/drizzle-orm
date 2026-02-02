import type { MigrationMeta } from './migrator';

export function formatToMillis(dateStr: string): number {
	const year = parseInt(dateStr.slice(0, 4), 10);
	const month = parseInt(dateStr.slice(4, 6), 10) - 1;
	const day = parseInt(dateStr.slice(6, 8), 10);
	const hour = parseInt(dateStr.slice(8, 10), 10);
	const minute = parseInt(dateStr.slice(10, 12), 10);
	const second = parseInt(dateStr.slice(12, 14), 10);

	return Date.UTC(year, month, day, hour, minute, second);
}

// postgres - string
// mysql - bigint
export function getMigrationsToRun(params: {
	localMigrations: MigrationMeta[];
	dbMigrations: { id: number; hash: string; created_at: string }[];
}): MigrationMeta[] {
	const { localMigrations, dbMigrations } = params;

	const dbMigrationsSet = new Set(dbMigrations.map((dbMigration) => Number(dbMigration.created_at)));
	const migrationsToRun = localMigrations.filter((lMigration) => !dbMigrationsSet.has(lMigration.folderMillis));

	return migrationsToRun;
}
