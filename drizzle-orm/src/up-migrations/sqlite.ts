import type { TablesRelationalConfig } from '~/_relations.ts';
import type { SQLiteD1Session } from '~/d1';
import type { LibSQLSession } from '~/libsql';
import type { MigrationMeta } from '~/migrator';
import type { AnyRelations } from '~/relations';
import { sql } from '~/sql';
import type { SQLiteCloudSession } from '~/sqlite-cloud';
import type { SQLiteSession } from '~/sqlite-core';
import type { SQLiteRemoteSession } from '~/sqlite-proxy';

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
export function upgradeSyncIfNeeded(
	migrationsTable: string,
	session: SQLiteSession<
		'sync',
		unknown,
		Record<string, unknown>,
		AnyRelations,
		TablesRelationalConfig
	>,
	localMigrations: MigrationMeta[],
): UpgradeResult {
	// Check if the table exists at all
	const tableExists = session.all<{ exists: number }>(
		sql`SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}) AS "exists"`,
	);

	if (tableExists[0]?.exists === 0) {
		return { newDb: true };
	}

	// Table exists, check if there are any rows
	const rows = session.all<{ id: number; hash: string; created_at: string; version: number | undefined }>(
		sql`SELECT * FROM ${sql.identifier(migrationsTable)} ORDER BY id ASC LIMIT 1`,
	);

	let prevVersion;

	if (rows.length === 0) {
		// Empty table - check if it has a version column
		const hasVersionColumn = session.all<{ exists: boolean }>(
			sql`SELECT EXISTS(
				SELECT 1
				FROM pragma_table_info(${sql.identifier(migrationsTable)})
				WHERE name = 'version'
			) AS "exists"`,
		);

		prevVersion = hasVersionColumn[0]?.exists ? 1 : 0;
	} else {
		prevVersion = rows[0]?.version ?? 0;
	}

	if (prevVersion < CURRENT_MIGRATION_TABLE_VERSION) {
		runSyncUpgrades(migrationsTable, session, prevVersion, localMigrations);
	}

	return { prevVersion, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at, version)
 */
export async function upgradeAsyncIfNeeded(
	migrationsTable: string,
	session:
		| SQLiteSession<
			'async',
			unknown,
			Record<string, unknown>,
			AnyRelations,
			TablesRelationalConfig
		>
		| SQLiteRemoteSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig>
		| SQLiteD1Session<Record<string, unknown>, AnyRelations, TablesRelationalConfig>
		| LibSQLSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig>
		| SQLiteCloudSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig>,
	localMigrations: MigrationMeta[],
): Promise<UpgradeResult> {
	// Check if the table exists at all
	const tableExists = await session.all<{ exists: number }>(
		sql`SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}) AS "exists"`,
	);

	if (tableExists[0]?.exists === 0) {
		return { newDb: true };
	}

	// Table exists, check if there are any rows
	const rows = await session.all<{ id: number; hash: string; created_at: string; version: number | undefined }>(
		sql`SELECT * FROM ${sql.identifier(migrationsTable)} ORDER BY id ASC LIMIT 1`,
	);

	let prevVersion;

	if (rows.length === 0) {
		// Empty table - check if it has a version column
		const hasVersionColumn = await session.all<{ exists: boolean }>(
			sql`SELECT EXISTS(
				SELECT 1
				FROM pragma_table_info(${sql.identifier(migrationsTable)})
				WHERE name = 'version'
			) AS "exists"`,
		);

		prevVersion = hasVersionColumn[0]?.exists ? 1 : 0;
	} else {
		prevVersion = rows[0]?.version ?? 0;
	}

	if (prevVersion < CURRENT_MIGRATION_TABLE_VERSION) {
		await runAsyncUpgrades(migrationsTable, session, prevVersion, localMigrations);
	}

	return { prevVersion, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}

/**
 * Map of upgrade functions. Each key is the version being upgraded FROM,
 * and the function upgrades the table to the next version.
 */
const upgradeAsyncFunctions: Record<
	number,
	(
		migrationsTable: string,
		session: SQLiteSession<
			'async',
			unknown,
			Record<string, unknown>,
			AnyRelations,
			TablesRelationalConfig
		>,
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
	0: async (migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsTable)}`;

		// 1. Add new columns
		await session.run(sql`ALTER TABLE ${table} ADD COLUMN "name" text`);
		await session.run(
			sql`ALTER TABLE ${table} ADD COLUMN "applied_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
		);
		await session.run(sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "version" INT`);

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

			await session.run(
				sql`UPDATE ${table} SET name = ${
					matched?.name ?? null
				}, version = ${1}, applied_at = NULL WHERE id = ${dbRow.id}`,
			);
		}
	},
};

const upgradeSyncFunctions: Record<
	number,
	(
		migrationsTable: string,
		session: SQLiteSession<
			'sync',
			unknown,
			Record<string, unknown>,
			AnyRelations,
			TablesRelationalConfig
		>,
		localMigrations: MigrationMeta[],
	) => void
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
	0: (migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsTable)}`;

		// 1. Add new columns
		session.run(sql`ALTER TABLE ${table} ADD COLUMN "name" text`);
		session.run(
			sql`ALTER TABLE ${table} ADD COLUMN "applied_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`,
		);
		session.run(sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "version" INT`);

		// 2. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		const dbRows = session.all<{ id: number; hash: string; created_at: string }>(
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

			session.run(
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
async function runAsyncUpgrades(
	migrationsTable: string,
	session: SQLiteSession<
		'async',
		unknown,
		Record<string, unknown>,
		AnyRelations,
		TablesRelationalConfig
	>,
	fromVersion: number,
	localMigrations: MigrationMeta[],
): Promise<void> {
	for (let v = fromVersion; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
		const upgradeFn = upgradeAsyncFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsTable, session, localMigrations);
	}
}

function runSyncUpgrades(
	migrationsTable: string,
	session: SQLiteSession<
		'sync',
		unknown,
		Record<string, unknown>,
		AnyRelations,
		TablesRelationalConfig
	>,
	fromVersion: number,
	localMigrations: MigrationMeta[],
): void {
	for (let v = fromVersion; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
		const upgradeFn = upgradeSyncFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		upgradeFn(migrationsTable, session, localMigrations);
	}
}
