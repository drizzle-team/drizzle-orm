import type { TablesRelationalConfig } from '~/_relations.ts';
import type { SQLiteD1Session } from '~/d1/session.ts';
import type { LibSQLSession } from '~/libsql/session.ts';
import type { MigrationMeta } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import type { SQLiteCloudSession } from '~/sqlite-cloud/session.ts';
import type { SQLiteSession } from '~/sqlite-core/session.ts';
import type { SQLiteRemoteSession } from '~/sqlite-proxy/session.ts';

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

// sqlite-proxy returns [ [string] ]
// sqlite returns [{ column_name: string }]
function allSync<T>(
	session: SQLiteSession<
		'sync',
		unknown,
		Record<string, unknown>,
		AnyRelations,
		TablesRelationalConfig
	>,
	sqlQuery: SQL,
	resultMapper: (row: any[]) => T = () => [] as T,
): T[] {
	const result = session.all(sqlQuery) as any[] | any[][];

	if (result.length === 0) return [];

	if (Array.isArray(result[0])) {
		return (result as any[][]).map((row) => resultMapper(row));
	}

	return result as T[];
}

// sqlite-proxy returns [ [string] ]
// sqlite returns [{ column_name: string }]
async function allAsync<T>(
	session: SQLiteSession<
		'async',
		unknown,
		Record<string, unknown>,
		AnyRelations,
		TablesRelationalConfig
	>,
	sqlQuery: SQL,
	resultMapper: (row: any[]) => T = () => [] as T,
): Promise<T[]> {
	const result = await session.all(sqlQuery) as any[] | any[][];

	if (result.length === 0) return [];

	if (Array.isArray(result[0])) {
		return (result as any[][]).map((row) => resultMapper(row));
	}

	return result as T[];
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
	// sqlite-proxy returns [ [1] ]
	// sqlite returns [{ '1': 1 }]
	let tableExists = allSync(
		session,
		sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`,
		(row) => ({ '1': row[0] }),
	);

	if (tableExists.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	const rows = allSync<{ column_name: string }>(
		session,
		sql`SELECT name as column_name FROM pragma_table_info(${migrationsTable})`,
		(row) => ({ column_name: row[0] }),
	);

	const version = getVersion(rows.map((r) => r.column_name));

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

		// sqlite returns array of objects for .all, but sqlite-proxy -> array of arrays
		const dbRows = allSync<{ id: number | null; hash: string; created_at: number }>(
			session,
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
			(row) => ({
				id: row[0],
				hash: row[1],
				created_at: row[2],
			}),
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
	let tableExists = await allAsync(
		session,
		sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`,
		(row) => ({ '1': row[0] }),
	);

	if (tableExists.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	// sqlite-proxy returns [ [string] ]
	// sqlite returns [{ column_name: string }]
	const rows = await allAsync(
		session,
		sql`SELECT name as column_name FROM pragma_table_info(${migrationsTable})`,
		(row) => ({ column_name: row[0] }),
	);

	const version = getVersion(rows.map((r) => r.column_name));

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
		const dbRows = await allAsync<{ id: number | null; hash: string; created_at: number }>(
			session,
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
			(row) => ({ id: row[0], hash: row[1], created_at: row[2] }),
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
