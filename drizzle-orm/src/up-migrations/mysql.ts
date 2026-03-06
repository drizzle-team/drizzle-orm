import type { MigrationMeta } from '~/migrator.ts';
import type { MySqlSession } from '~/mysql-core/session.ts';
import { type SQL, sql } from '~/sql/sql.ts';

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

// mysql returns array of objects for .all, but mysql-proxy -> array of arrays
async function all<T>(
	session: MySqlSession,
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
 * Map of upgrade functions. Each key is the version being upgraded FROM,
 * and the function upgrades the table to the next version.
 */
const upgradeFunctions: Record<
	number,
	(
		migrationsTable: string,
		session: MySqlSession,
		localMigrations: MigrationMeta[],
	) => Promise<void>
> = {
	/**
	 * Upgrade from version 0 to version 1:
	 * 1. Add `name` column (text)
	 * 2. Add `applied_at` column (timestamp, defaults to now())
	 * 3. Backfill `name` for existing rows by matching `created_at` (millis) to local migration folder timestamps
	 * 4. If multiple migrations share the same second, use hash matching as a tiebreaker
	 * Not implemented for now -> 5. If hash matching fails, fall back to serial id ordering
	 */
	0: async (migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsTable)}`;

		// 1. Add new columns
		await session.execute(sql`ALTER TABLE ${table} ADD \`name\` text`);
		await session.execute(
			sql`ALTER TABLE ${table} ADD \`applied_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
		);

		// 2. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		// mysql returns array of objects for .all, but mysql-proxy -> array of arrays
		// .execute returns [ [ { key: value } ], [ <smth here> ] ] for both
		const dbRows = await all<{ id: number; hash: string; created_at: string }>(
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
	migrationsTable: string,
	session: MySqlSession,
	localMigrations: MigrationMeta[],
): Promise<UpgradeResult> {
	// Check if the table exists at all
	// mysql returns [{'1': 1}] for .all, but mysql-proxy -> [ [1] ]
	// .execute returns [ [ { '1': 1 } ], [ `1` BIGINT(2) NOT NULL ] ] for both
	const result = await all<{ '1': 1 }>(
		session,
		sql`SELECT 1 FROM information_schema.tables 
			WHERE table_name = ${migrationsTable}`,
		(row) => ({ '1': row[0] }),
	);

	if (result.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	// mysql returns [{column_name: string}] for .all, but mysql-proxy -> [ [string] ]
	// .execute returns [ [ { column_name: string } ], [ <smth here> ] ] for both
	const rows = await all<{ column_name: string }>(
		session,
		sql`SELECT column_name as \`column_name\`
		FROM information_schema.columns
		WHERE table_name = ${migrationsTable}
		ORDER BY ordinal_position`,
		(row) => ({ column_name: row[0] }),
	);

	const version = getVersion(rows.map((r) => r.column_name));

	for (let v = version; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
		const upgradeFn = upgradeFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsTable, session, localMigrations);
	}

	return { prevVersion: version, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}
