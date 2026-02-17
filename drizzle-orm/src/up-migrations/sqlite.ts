import type { TablesRelationalConfig } from '~/_relations.ts';
import type { SQLiteD1Session } from '~/d1';
import type { LibSQLSession } from '~/libsql';
import type { MigrationMeta } from '~/migrator';
import type { AnyRelations } from '~/relations';
import { sql } from '~/sql';
import type { SQLiteCloudSession } from '~/sqlite-cloud';
import type { SQLiteSession } from '~/sqlite-core';
import type { SQLiteRemoteSession } from '~/sqlite-proxy';

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
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at)
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
	const result = session.all(
		sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`,
	);

	if (result.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	const rows = session.all<{ name: string }>(
		sql`SELECT name FROM pragma_table_info(${migrationsTable})`,
	);

	const version = getVersion(rows.map((r) => r.name));

	for (let v = version; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
		const upgradeFn = upgradeSyncFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		upgradeFn(migrationsTable, session, localMigrations);
	}

	return { prevVersion: version, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}

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
	 * 2. Add `applied_at` column (text)
	 * 3. Backfill `name` for existing rows by matching `created_at` (millis) to local migration folder timestamps
	 * 4. If multiple migrations share the same second, use hash matching as a tiebreaker
	 * Not implemented for now -> 5. If hash matching fails, fall back to serial id ordering
	 */
	0: (migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsTable)}`;

		// 1. Add new columns
		session.run(sql`ALTER TABLE ${table} ADD COLUMN "name" text`);
		session.run(
			sql`ALTER TABLE ${table} ADD COLUMN "applied_at" TEXT`,
		);

		// 2. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		// this can be null from legacy implementation where id was serial
		const dbRows = session.all<{ id: number | null; hash: string; created_at: number }>(
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
			const stringified = String(dbRow.created_at);
			const millis = Number(stringified.substring(0, stringified.length - 3) + '000');
			const candidates = byMillis.get(millis);

			let matched: MigrationMeta | undefined;
			let matchedBy: 'hash' | 'millis' | null = null;
			if (candidates && candidates.length === 1) {
				matched = candidates[0];
				matchedBy = 'millis';
			} else if (candidates && candidates.length > 1) {
				matched = candidates.find((c) => c.hash && dbRow.hash && c.hash === dbRow.hash); // for bun-sqlite cases (journal had empty hash);
				if (matched) matchedBy = 'hash';
			} else {
				matched = byHash.get(dbRow.hash);
				if (matched) matchedBy = 'hash';
			}

			const updateQuery = sql`UPDATE ${table} SET name = ${matched?.name ?? null}, applied_at = NULL WHERE`;

			if (dbRow.id) updateQuery.append(sql` id = ${dbRow.id}`);
			else if (matchedBy === 'millis') updateQuery.append(sql` created_at = ${dbRow.created_at}`);
			else if (matchedBy === 'hash') updateQuery.append(sql` hash = ${dbRow.hash}`);
			else continue; // do not update anything

			session.run(updateQuery);
		}
	},
};

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at)
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
	const tableExists = await session.all(
		sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`,
	);

	if (tableExists.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	const rows = await session.all<{ name: string }>(
		sql`SELECT name FROM pragma_table_info(${migrationsTable})`,
	);

	const version = getVersion(rows.map((r) => r.name));

	for (let v = version; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
		const upgradeFn = upgradeAsyncFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsTable, session, localMigrations);
	}

	return { prevVersion: version, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}

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
	 * 2. Add `applied_at` column (text)
	 * 3. Backfill `name` for existing rows by matching `created_at` (millis) to local migration folder timestamps
	 * 4. If multiple migrations share the same second, use hash matching as a tiebreaker
	 * Not implemented for now -> 5. If hash matching fails, fall back to serial id ordering
	 */
	0: async (migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsTable)}`;

		// 1. Add new columns
		await session.run(sql`ALTER TABLE ${table} ADD COLUMN "name" text`);
		await session.run(
			sql`ALTER TABLE ${table} ADD COLUMN "applied_at" TEXT`,
		);

		// 2. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		// this can be null from legacy implementation where id was serial
		const dbRows = await session.all<{ id: number | null; hash: string; created_at: number }>(
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
			const stringified = String(dbRow.created_at);
			const millis = Number(stringified.substring(0, stringified.length - 3) + '000');
			const candidates = byMillis.get(millis);

			let matched: MigrationMeta | undefined;
			let matchedBy: 'hash' | 'millis' | null = null;
			if (candidates && candidates.length === 1) {
				matched = candidates[0];
				matchedBy = 'millis';
			} else if (candidates && candidates.length > 1) {
				matched = candidates.find((c) => c.hash && dbRow.hash && c.hash === dbRow.hash); // for bun-sqlite cases (journal had empty hash)
				if (matched) matchedBy = 'hash';
			} else {
				matched = byHash.get(dbRow.hash);
				if (matched) matchedBy = 'hash';
			}

			const updateQuery = sql`UPDATE ${table} SET name = ${matched?.name ?? null}, applied_at = NULL WHERE`;

			if (dbRow.id) updateQuery.append(sql` id = ${dbRow.id}`);
			else if (matchedBy === 'millis') updateQuery.append(sql` created_at = ${dbRow.created_at}`);
			else if (matchedBy === 'hash') updateQuery.append(sql` hash = ${dbRow.hash}`);
			else continue; // do not update anything

			await session.run(updateQuery);
		}
	},
};
