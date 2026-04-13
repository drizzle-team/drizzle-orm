import type { TablesRelationalConfig } from '~/_relations.ts';
import type { MigrationMeta } from '~/migrator.ts';
import type { AnyRelations } from '~/relations.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import type { BaseSQLiteDatabase } from '~/sqlite-core';
import type { SQLiteSession } from '~/sqlite-core/session.ts';
import { GET_VERSION_FOR, MIGRATIONS_TABLE_VERSIONS, type UpgradeResult } from './utils.ts';

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
	const tableExists = session.all(
		sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`,
	);

	if (tableExists.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	const rows = session.all<{ column_name: string }>(
		sql`SELECT name as column_name FROM pragma_table_info(${migrationsTable})`,
	);

	const version = GET_VERSION_FOR.sqlite(rows.map((r) => r.column_name));

	for (let v = version; v < MIGRATIONS_TABLE_VERSIONS.sqlite; v++) {
		const upgradeFn = upgradeSyncFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		upgradeFn(migrationsTable, session, localMigrations);
	}

	return { newDb: false };
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
		const dbRows = session.all<{ id: number | null; hash: string; created_at: number }>(
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
	db: BaseSQLiteDatabase<'async', unknown, Record<string, unknown>>,
	localMigrations: MigrationMeta[],
): Promise<UpgradeResult> {
	// Check if the table exists at all
	const tableExists = await db.session.all(
		sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`,
	);

	if (tableExists.length === 0) {
		return { newDb: true };
	}

	const rows = await db.session.all<{ column_name: string }>(
		sql`SELECT name as column_name FROM pragma_table_info(${migrationsTable})`,
	);

	const version = GET_VERSION_FOR.sqlite(rows.map((r) => r.column_name));

	for (let v = version; v < MIGRATIONS_TABLE_VERSIONS.sqlite; v++) {
		const upgradeFn = upgradeAsyncFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsTable, db, localMigrations);
	}

	return { newDb: false };
}

const upgradeAsyncFunctions: Record<
	number,
	(
		migrationsTable: string,
		db: BaseSQLiteDatabase<'async', unknown, Record<string, unknown>>,
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
	0: async (migrationsTable, db, localMigrations) => {
		const table = sql`${sql.identifier(migrationsTable)}`;

		// 1. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		// this can be null from legacy implementation where id was serial
		const dbRows = await db.session.all<{ id: number | null; hash: string; created_at: number }>(
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
			sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier('name')} text`,
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

		await db.transaction(async (tx) => {
			for (const statement of statements) {
				await tx.run(statement);
			}
		});
	},
};
