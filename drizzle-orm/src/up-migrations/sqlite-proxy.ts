import type { MigrationMeta } from '~/migrator.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import type { BaseSQLiteDatabase } from '~/sqlite-core/index.ts';
import type { SqliteRemoteDatabase } from '~/sqlite-proxy/index.ts';
import { GET_VERSION_FOR, MIGRATIONS_TABLE_VERSIONS, type UpgradeResultProxy } from './utils.ts';

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at)
 */
export async function upgradeAsyncIfNeeded(
	migrationsTable: string,
	db: SqliteRemoteDatabase<Record<string, unknown>>,
	localMigrations: MigrationMeta[],
): Promise<UpgradeResultProxy> {
	// Check if the table exists at all
	const tableExists = (await db.session.all<[string]>(
		sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`,
	)).map((row) => ({ '1': row[0] }));

	if (tableExists.length === 0) {
		return { newDb: true, statements: [] };
	}

	// Table exists, check table shape
	// sqlite-proxy returns [ [string] ]
	// sqlite returns [{ column_name: string }]
	const rows = (await db.session.all<[string]>(
		sql`SELECT name as column_name FROM pragma_table_info(${migrationsTable})`,
	)).map((it) => ({ column_name: it[0] }));

	const version = GET_VERSION_FOR.sqlite(rows.map((r) => r.column_name));

	let statements: string[] = [];
	for (let v = version; v < MIGRATIONS_TABLE_VERSIONS.sqlite; v++) {
		const upgradeFn = upgradeAsyncFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		statements = await upgradeFn(migrationsTable, db, localMigrations);
	}

	return { newDb: false, statements };
}

const upgradeAsyncFunctions: Record<
	number,
	(
		migrationsTable: string,
		db: BaseSQLiteDatabase<'async', unknown, Record<string, unknown>>,
		localMigrations: MigrationMeta[],
	) => Promise<string[]>
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
	0: async (migrationsTable, db, localMigrations) => {
		const table = sql`${sql.identifier(migrationsTable)}`;

		// 1. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		// this can be null from legacy implementation where id was serial
		const dbRows = (await db.session.all<[number | null, string, number]>(
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
		)).map((row) => ({
			id: row[0]!,
			hash: row[1]!,
			created_at: row[2]!,
		}));

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
		const statements: SQL[] = [
			sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier('name')} text`.inlineParams(),
			sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier('applied_at')} TEXT`,
		];
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

			statements.push(updateQuery);
		}

		return statements.map((st) => db.dialect.sqlToQuery(st.inlineParams()).sql);
	},
};
