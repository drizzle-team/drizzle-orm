import type { MigrationMeta } from '~/migrator';
import type { MsSqlSession } from '~/mssql-core';
import { sql } from '~/sql';

export const CURRENT_MIGRATION_TABLE_VERSION = 1;

interface UpgradeResult {
	newDb?: boolean;
	prevVersion?: number;
	currentVersion?: number;
}

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at, version)
 */
export async function upgradeIfNeeded(
	migrationsSchema: string,
	migrationsTable: string,
	session: MsSqlSession,
	localMigrations: MigrationMeta[],
): Promise<UpgradeResult> {
	// Check if the table exists at all
	const tableExists = await session.all<{ exists: 0 | 1 }>(
		sql`IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ${migrationsSchema} AND TABLE_NAME = ${migrationsTable})
		SELECT 1 AS TableExists
	ELSE
		SELECT 0 AS TableExists`,
	);

	if (!tableExists[0]?.exists) {
		return { newDb: true };
	}

	// Table exists, check if there are any rows
	const rows = await session.all<{ id: number; hash: string; created_at: string; version: number | undefined }>(
		sql`SELECT TOP 1 * FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} ORDER BY id ASC;`,
	);

	let prevVersion;

	if (rows.length === 0) {
		// Empty table - check if it has a version column
		const hasVersionColumn = await session.all<{ exists: 0 | 1 }>(
			sql`SELECT CASE WHEN EXISTS (
			SELECT 1
			FROM INFORMATION_SCHEMA.COLUMNS
			WHERE TABLE_SCHEMA = ${migrationsSchema}
      		AND TABLE_NAME = ${migrationsTable}
      		AND COLUMN_NAME = 'version'
		)
		THEN 1
		ELSE 0
		END AS ColumnExists
			)`,
		);

		prevVersion = hasVersionColumn[0]?.exists ? 1 : 0;
	} else {
		prevVersion = rows[0]?.version ?? 0;
	}

	if (prevVersion < CURRENT_MIGRATION_TABLE_VERSION) {
		await runUpgrades(migrationsSchema, migrationsTable, session, prevVersion, localMigrations);
	}

	return { prevVersion, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}

/**
 * Map of upgrade functions. Each key is the version being upgraded FROM,
 * and the function upgrades the table to the next version.
 */
const upgradeFunctions: Record<
	number,
	(
		migrationsSchema: string,
		migrationsTable: string,
		session: MsSqlSession,
		localMigrations: MigrationMeta[],
	) => Promise<void>
> = {
	/**
	 * Upgrade from version 0 to version 1:
	 * 1. Add `name` column (text)
	 * 2. Add `applied_at` column (timestamp with time zone, defaults to now())
	 * 3. Add `version` column (integer)
	 * 4. Backfill `name` for existing rows by matching `created_at` (millis) to local migration folder timestamps
	 * 5. If multiple migrations share the same second, use hash matching as a tiebreaker
	 * Not implemented for now -> 6. If hash matching fails, fall back to serial id ordering
	 * 7. Set `version` to 1 on all rows
	 */
	0: async (migrationsSchema, migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

		// 1. Add new columns
		await session.execute(sql`ALTER TABLE ${table} ADD [name] text`);
		await session.execute(
			sql`ALTER TABLE ${table} ADD [applied_at] datetime2 DEFAULT GETUTCDATE()`,
		);
		await session.execute(sql`ALTER TABLE ${table} ADD [version] int`);
		// 2. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		const dbRows = await session.all<{ id: number; hash: string; created_at: string }>(
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
		);

		if (dbRows.length === 0) {
			return;
		}

		// 3. Sort ASC by millis and if the same - sort by name
		localMigrations.sort((a, b) =>
			a.folderMillis !== b.folderMillis ? a.folderMillis - b.folderMillis : (a.name ?? '').localeCompare(b.name ?? '')
		);

		const byMillis = new Map<number, MigrationMeta[]>();
		const byHash = new Map<string, MigrationMeta>();
		for (const lm of localMigrations) {
			if (!byMillis.has(lm.folderMillis)) {
				byMillis.set(lm.folderMillis, []);
			}
			byMillis.get(lm.folderMillis)!.push(lm);
			byHash.set(lm.hash, lm);
		}

		// 4. Match each DB row to a local migration and backfill name
		//    Priority: millis -> hash -> serial position
		for (const dbRow of dbRows) {
			const millis = Number(dbRow.created_at);
			const candidates = byMillis.get(millis);

			let matched: MigrationMeta | undefined;

			if (candidates && candidates.length === 1) {
				matched = candidates[0];
			} else if (candidates && candidates.length > 1) {
				matched = candidates.find((c) => c.hash === dbRow.hash);
			} else {
				matched = byHash.get(dbRow.hash);
			}

			await session.execute(
				sql`UPDATE ${table} SET name = ${
					matched?.name ?? null
				}, version = ${1}, applied_at = NULL WHERE id = ${dbRow.id}`,
			);
		}
	},
};

/**
 * Runs all upgrade functions sequentially from `fromVersion` to CURRENT_MIGRATION_TABLE_VERSION.
 */
async function runUpgrades(
	migrationsSchema: string,
	migrationsTable: string,
	session: MsSqlSession,
	fromVersion: number,
	localMigrations: MigrationMeta[],
): Promise<void> {
	for (let v = fromVersion; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
		const upgradeFn = upgradeFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsSchema, migrationsTable, session, localMigrations);
	}
}
