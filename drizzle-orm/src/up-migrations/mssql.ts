import type { MigrationMeta } from '~/migrator';
import type { MsSqlSession } from '~/mssql-core';
import { sql } from '~/sql/sql.ts';

const CURRENT_MIGRATION_TABLE_VERSION = 1;

interface UpgradeResult {
	newDb?: boolean;
	prevVersion?: number;
	currentVersion?: number;
}

function getVersion(columns: string[]) {
	if (columns.includes('name')) return 1;
	return 0;
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
	 * 2. Add `applied_at` column (datetime2, defaults to now())
	 * 3. Backfill `name` for existing rows by matching `created_at` (millis) to local migration folder timestamps
	 * 4. If multiple migrations share the same second, use hash matching as a tiebreaker
	 * Not implemented for now -> 5. If hash matching fails, fall back to serial id ordering
	 */
	0: async (migrationsSchema, migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

		// 1. Add new columns
		await session.execute(sql`ALTER TABLE ${table} ADD [name] text`);
		await session.execute(
			sql`ALTER TABLE ${table} ADD [applied_at] datetime2 DEFAULT GETUTCDATE()`,
		);
		// 2. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		const dbRows = await session.execute<{ recordset: { id: number; hash: string; created_at: string }[] }>(
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
		);

		if (dbRows.recordset.length === 0) {
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
		for (const dbRow of dbRows.recordset) {
			const stringified = String(dbRow.created_at);
			const millis = Number(stringified.substring(0, stringified.length - 3) + '000');
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
				sql`UPDATE ${table} SET name = ${matched?.name ?? null}, applied_at = NULL WHERE id = ${dbRow.id}`,
			);
		}
	},
};

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at)
 */
export async function upgradeIfNeeded(
	migrationsSchema: string,
	migrationsTable: string,
	session: MsSqlSession,
	localMigrations: MigrationMeta[],
): Promise<UpgradeResult> {
	// Check if the table exists at all
	const result = await session.execute<{ recordset: { [key: string]: unknown }[] }>(
		sql`SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
			WHERE TABLE_SCHEMA = ${migrationsSchema} 
			AND TABLE_NAME = ${migrationsTable}`,
	);

	if (result.recordset.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	const rows = await session.execute<{ recordset: { column_name: string }[] }>(
		sql`SELECT COLUMN_NAME as [column_name]
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_SCHEMA = ${migrationsSchema}
		AND TABLE_NAME = ${migrationsTable}
		ORDER BY ORDINAL_POSITION`,
	);

	const version = getVersion(rows.recordset.map((r) => r.column_name));

	for (let v = version; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
		const upgradeFn = upgradeFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsSchema, migrationsTable, session, localMigrations);
	}

	return { prevVersion: version, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}
