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

export function getMigrationsToRun(params: {
	localMigrations: MigrationMeta[];
	dbMigrations: { id: number; hash: string; created_at: string; name?: string }[];
}): MigrationMeta[] {
	const { localMigrations, dbMigrations } = params;

	const dbNamesSet = new Set(
		dbMigrations.map((m) => m.name).filter((n): n is string => n !== null),
	);
	return localMigrations.filter((lm) => !lm.name || !dbNamesSet.has(lm.name));
}
