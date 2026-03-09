import type { TablesRelationalConfig } from '~/_relations.ts';
import type { MigrationMeta } from '~/migrator.ts';
import type { NeonHttpSession } from '~/neon-http/session.ts';
import type { PgAsyncSession } from '~/pg-core/async/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import type { XataHttpSession } from '~/xata-http/session.ts';

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

// postgres.js returns array of objects
// pg-proxy returns arrays of objects
// node-postgres returns { rows: array of objects }
async function execute<T extends any[]>(
	session:
		| PgAsyncSession
		| NeonHttpSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig>
		| XataHttpSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig>,
	sql: SQL,
): Promise<T> {
	const result: { rows: T } | T = await session.execute(sql);
	if ('rows' in result) return result.rows;
	return result;
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
		session:
			| PgAsyncSession
			| NeonHttpSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig>
			| XataHttpSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig>,
		localMigrations: MigrationMeta[],
	) => Promise<void>
> = {
	/**
	 * Upgrade from version 0 to version 1:
	 * 1. Add `name` column (text)
	 * 2. Add `applied_at` column (timestamp with time zone, defaults to now())
	 * 3. Backfill `name` for existing rows by matching `created_at` (millis) to local migration folder timestamps
	 * 4. If multiple migrations share the same second, use hash matching as a tiebreaker
	 * Not implemented for now -> 5. If hash matching fails, fall back to serial id ordering
	 */
	0: async (migrationsSchema, migrationsTable, session, localMigrations) => {
		const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

		// 1. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		const dbRows = await execute<{ id: number; hash: string; created_at: string }[]>(
			session,
			sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`,
		);

		if (dbRows.length === 0) {
			return;
		}

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

		// 	3. Match each DB row to a local migration and backfill name
		// 	Priority: millis -> hash

		const map: { id: number; created_at: string; name: string | null }[] = [];

		// fill map with entries
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

			map.push({ id: dbRow.id, created_at: dbRow.created_at, name: matched?.name ?? null });
		}

		// if any entry was not found - warn the user and exit
		const unmatchedMigrations = map.filter((it) => !localMigrations.some((lm) => lm.name === it.name));
		for (const uMigration of unmatchedMigrations) {
			console.log(
				`Warning: could not find a match for local migration "${uMigration.name}" in the database. This migration will be ignored in the backfilling process, and its name will not be backfilled to the DB. Local migrations that do not have a match in the DB will still be applied to the DB in the future, but that could cause issues.`,
			);
		}

		// Backfill names for matched migrations
		try {
			await execute(session, sql`BEGIN`);
			await execute(session, sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "name" text`);
			await execute(
				session,
				sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "applied_at" timestamp with time zone DEFAULT now()`,
			);

			for (const backfillEntry of map) {
				await execute(
					session,
					sql`UPDATE ${table} SET name = ${backfillEntry.name}, applied_at = NULL WHERE id = ${backfillEntry.id}`,
				);
			}
			await execute(session, sql`COMMIT`);
		} catch (err: any) {
			await execute(session, sql`ROLLBACK`);
			throw err;
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
	session:
		| PgAsyncSession
		| NeonHttpSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig>
		| XataHttpSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig>,
	localMigrations: MigrationMeta[],
): Promise<UpgradeResult> {
	// Check if the table exists at all
	const result = await execute<{ '1': 1 }[]>(
		session,
		sql`SELECT 1 FROM information_schema.tables
			WHERE table_schema = ${migrationsSchema}
			AND table_name = ${migrationsTable}`,
	);

	if (result.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	const rows = await execute<
		{ schema: string; table_name: string; column_name: string; type: string }[]
	>(
		session,
		sql`SELECT
			n.nspname AS "schema",
			c.relname AS "table_name",
			a.attname AS "column_name",
			pg_catalog.format_type(a.atttypid, a.atttypmod) AS "type"
		FROM
			pg_catalog.pg_attribute a
			JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE
			a.attnum > 0
			AND NOT a.attisdropped
			AND n.nspname = ${migrationsSchema}
			AND c.relname = ${migrationsTable}
		ORDER BY a.attnum;`,
	);

	let version = getVersion(rows.map((r) => r.column_name));

	for (let v = version; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
		const [dbMigrations] = await session.all<{ count: number }>(
			sql`select COUNT(*) as count from ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
		);

		if (dbMigrations!.count > localMigrations.length) {
			console.log(
				`Error: The database has more migrations (${
					dbMigrations!.count
				}) than the local migrations (${localMigrations.length}). This could indicate a mismatch between the local and database migration states. Make sure you have the latest local migrations that correspond to the database state`,
			);
			process.exit(1);
		}

		const upgradeFn = upgradeFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsSchema, migrationsTable, session, localMigrations);
	}

	return { prevVersion: version, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}
