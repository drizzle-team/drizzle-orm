import type { MigrationMeta } from '~/migrator.ts';
import type { MySqlSession } from '~/mysql-core/session.ts';
import { sql } from '~/sql/sql.ts';
import { GET_VERSION_FOR, MIGRATIONS_TABLE_VERSIONS, type UpgradeResult } from './utils.ts';

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
		const dbRows = await session.objects<{ id: number; hash: string; created_at: string }>(
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
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
		const toApply: { id: number; name: string }[] = [];
		let unmatchedIds: number[] = [];

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

			if (matched) toApply.push({ id: dbRow.id, name: matched.name });
			else unmatchedIds.push(dbRow.id);
		}

		// 4. Check for unmatched
		// Our assumption on this migration flow is that all DB entries should be matched to a local migration
		// (if same seconds - fallback to hash, if hash fails - corner case)
		// If there are unmatched entries, it means that the local environment is missing migrations that have been applied to the DB,
		// which can lead to inconsistencies and potential issues when running future migrations
		if (unmatchedIds.length > 0) {
			throw Error(
				`While upgrading your database migrations table we found ${unmatchedIds.length} migrations (ids: ${
					unmatchedIds.join(', ')
				}) in the database that do not match any local migration. This means that some migrations were applied to the database but are missing from the local environment`,
			);
		}

		// 5. Create extra column and backfill names for matched migrations
		await session.objects(sql`ALTER TABLE ${table} ADD ${sql.identifier('name')} text`);
		await session.objects(
			sql`ALTER TABLE ${table} ADD ${sql.identifier('applied_at')} TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
		);

		for (const backfillEntry of toApply) {
			await session.objects(
				sql`UPDATE ${table} SET ${sql.identifier('name')} = ${backfillEntry.name}, ${
					sql.identifier('applied_at')
				} = NULL WHERE ${sql.identifier('id')} = ${backfillEntry.id}`,
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
	const result = await session.objects<{ '1': 1 }>(
		sql`SELECT 1 FROM information_schema.tables 
			WHERE table_name = ${migrationsTable}
			AND table_schema = DATABASE()`,
	);

	if (result.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	const rows = await session.objects<{ column_name: string }>(
		sql`SELECT column_name as \`column_name\`
		FROM information_schema.columns
		WHERE table_name = ${migrationsTable}
		AND table_schema = DATABASE()
		ORDER BY ordinal_position`,
	);

	const version = GET_VERSION_FOR.mysql(rows.map((r) => r.column_name));

	for (let v = version; v < MIGRATIONS_TABLE_VERSIONS.mysql; v++) {
		const upgradeFn = upgradeFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsTable, session, localMigrations);
	}

	return { newDb: false };
}
