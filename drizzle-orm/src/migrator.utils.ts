export interface MigrationMeta {
	sql: string[];
	folderMillis: number;
	hash: string;
	bps: boolean;
	name: string;
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

export function getMigrationsToRun(params: {
	localMigrations: MigrationMeta[];
	dbMigrations: { id: number; hash: string; created_at: string; name: string | null }[];
}): MigrationMeta[] {
	const { localMigrations, dbMigrations } = params;

	const dbNamesSet = new Set(
		dbMigrations.map((m) => m.name).filter((n): n is string => n !== null),
	);
	return localMigrations.filter((lm) => !lm.name || !dbNamesSet.has(lm.name));
}

/** Reads migrations bundled as an object of `<tag>: <sql>` */
export function readMigrationsFromRecord(migrations: Record<string, string>): MigrationMeta[] {
	const migrationQueries: MigrationMeta[] = [];

	const sortedMigrations = Object.keys(migrations).sort();

	for (const key of sortedMigrations) {
		const query = migrations[key];
		if (!query) {
			throw new Error(`Missing migration: ${key}`);
		}

		try {
			const result = query.split('--> statement-breakpoint').map((it) => {
				return it;
			});

			const migrationDate = formatToMillis(key.slice(0, 14));

			migrationQueries.push({
				sql: result,
				bps: true,
				folderMillis: migrationDate,
				hash: '',
				name: key,
			});
		} catch {
			throw new Error(`Failed to parse migration: ${key}`);
		}
	}

	return migrationQueries;
}
