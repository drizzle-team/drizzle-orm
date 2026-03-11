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
	const tableExists = allSync(
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
	 * 1. Read all existing DB migrations
	 * 2. Sort localMigrations ASC by millis and if the same - sort by name
	 * 3. Match each DB row to a local migration
	 * If multiple migrations share the same second, use hash matching as a tiebreaker
	 * Not implemented for now -> If hash matching fails, fall back to serial id ordering
	 * 5. Create extra column and backfill names for matched migrations
	 */
	0: (migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsTable)}`;

		// 1. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		// this can be null from legacy implementation where id was serial
		const dbRows = allSync<{ id: number | null; hash: string; created_at: number }>(
			session,
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
			(row) => ({
				id: row[0],
				hash: row[1],
				created_at: row[2],
			}),
		);

		// 2. Sort ASC by millis and if the same - sort by name
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

		// 	3. Match each DB row to a local migration
		// 	Priority: millis -> hash

		// id can be null from legacy implementation where id was serial
		const toApply: {
			id: number | null;
			name: string;
			hash: string;
			created_at: string;
			matchedBy: 'id' | 'hash' | 'millis';
		}[] = [];

		// id can be null from legacy implementation where id was serial
		// hash can only be '' for bun-sqlite journal entries
		let unmatched: { id: number | null; hash: string; created_at: number }[] = [];

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

			if (matched) {
				toApply.push({
					id: dbRow.id,
					name: matched.name,
					hash: dbRow.hash,
					created_at: stringified,
					matchedBy: dbRow.id ? 'id' : matchedBy!,
				});
			} else unmatched.push(dbRow);
		}

		// 4. Check for unmatched
		// Our assumption on this migration flow is that all DB entries should be matched to a local migration
		// (if same seconds - fallback to hash, if hash fails - corner case)
		// If there are unmatched entries, it means that the local environment is missing migrations that have been applied to the DB,
		// which can lead to inconsistencies and potential issues when running future migrations
		if (unmatched.length > 0) {
			throw Error(
				`While upgrading your database migrations table we found ${unmatched.length} (${
					unmatched.map((it) => `[id: ${it.id}, created_at: ${it.created_at}]`).join(', ')
				}) migrations in the database that do not match any local migration. This means that some migrations were applied to the database but are missing from the local environment`,
			);
		}

		// 5. Create extra column and backfill names for matched migrations
		session.transaction((tx) => {
			tx.run(sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier('name')} text`);
			tx.run(
				sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier('applied_at')} TEXT`,
			);

			for (const backfillEntry of toApply) {
				const updateQuery = sql`UPDATE ${table} SET ${sql.identifier('name')} = ${backfillEntry.name}, ${
					sql.identifier('applied_at')
				} = NULL WHERE`;

				// id
				// created_at
				// hash
				if (backfillEntry.id) updateQuery.append(sql` ${sql.identifier('id')} = ${backfillEntry.id}`);
				else if (backfillEntry.matchedBy === 'millis') {
					updateQuery.append(sql` ${sql.identifier('created_at')} = ${backfillEntry.created_at}`);
				} else updateQuery.append(sql` ${sql.identifier('hash')} = ${backfillEntry.hash}`);

				tx.run(updateQuery);
			}
		});
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
	const tableExists = await allAsync(
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
	 * 1. Read all existing DB migrations
	 * 2. Sort localMigrations ASC by millis and if the same - sort by name
	 * 3. Match each DB row to a local migration
	 * If multiple migrations share the same second, use hash matching as a tiebreaker
	 * Not implemented for now -> If hash matching fails, fall back to serial id ordering
	 * 5. Create extra column and backfill names for matched migrations
	 */
	0: async (migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsTable)}`;

		// 1. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		// this can be null from legacy implementation where id was serial
		const dbRows = await allAsync<{ id: number | null; hash: string; created_at: number }>(
			session,
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
			(row) => ({
				id: row[0],
				hash: row[1],
				created_at: row[2],
			}),
		);

		// 2. Sort ASC by millis and if the same - sort by name
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

		// 	3. Match each DB row to a local migration
		// 	Priority: millis -> hash

		// id can be null from legacy implementation where id was serial
		const toApply: {
			id: number | null;
			name: string;
			hash: string;
			created_at: string;
			matchedBy: 'id' | 'hash' | 'millis';
		}[] = [];

		// id can be null from legacy implementation where id was serial
		// hash can only be '' for bun-sqlite journal entries
		let unmatched: { id: number | null; hash: string; created_at: number }[] = [];

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

			if (matched) {
				toApply.push({
					id: dbRow.id,
					name: matched.name,
					hash: dbRow.hash,
					created_at: stringified,
					matchedBy: dbRow.id ? 'id' : matchedBy!,
				});
			} else unmatched.push(dbRow);
		}

		// 4. Check for unmatched
		// Our assumption on this migration flow is that all DB entries should be matched to a local migration
		// (if same seconds - fallback to hash, if hash fails - corner case)
		// If there are unmatched entries, it means that the local environment is missing migrations that have been applied to the DB,
		// which can lead to inconsistencies and potential issues when running future migrations
		if (unmatched.length > 0) {
			throw Error(
				`While upgrading your database migrations table we found ${unmatched.length} (${
					unmatched.map((it) => `[id: ${it.id}, created_at: ${it.created_at}]`).join(', ')
				}) migrations in the database that do not match any local migration. This means that some migrations were applied to the database but are missing from the local environment`,
			);
		}

		// 5. Create extra column and backfill names for matched migrations
		await session.transaction(async (tx) => {
			await tx.run(sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier('name')} text`);
			await tx.run(
				sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier('applied_at')} TEXT`,
			);

			for (const backfillEntry of toApply) {
				const updateQuery = sql`UPDATE ${table} SET ${sql.identifier('name')} = ${backfillEntry.name}, ${
					sql.identifier('applied_at')
				} = NULL WHERE`;

				// id
				// created_at
				// hash
				if (backfillEntry.id) updateQuery.append(sql` ${sql.identifier('id')} = ${backfillEntry.id}`);
				else if (backfillEntry.matchedBy === 'millis') {
					updateQuery.append(sql` ${sql.identifier('created_at')} = ${backfillEntry.created_at}`);
				} else updateQuery.append(sql` ${sql.identifier('hash')} = ${backfillEntry.hash}`);

				await tx.run(updateQuery);
			}
		});
	},
};
