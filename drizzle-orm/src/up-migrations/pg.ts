import type { TablesRelationalConfig } from '~/_relations.ts';
import type { BatchItem } from '~/batch.ts';
import type { MigrationMeta } from '~/migrator.ts';
import type { NeonHttpDatabase } from '~/neon-http/driver.ts';
import type { NeonHttpSession } from '~/neon-http/session.ts';
import type { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import type { PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
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
		db: PgAsyncDatabase<PgQueryResultHKT, any, any, any>,
		localMigrations: MigrationMeta[],
		mode: 'transaction' | 'execute' | 'batch',
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
	0: async (migrationsSchema, migrationsTable, db, localMigrations, mode) => {
		const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

		// 1. Read all existing DB migrations
		// Sort them by ids asc (order how they were applied)
		const dbRows = await execute<{ id: number; hash: string; created_at: string }[]>(
			db.session,
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
		const sqls: SQL[] = [
			sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${sql.identifier('name')} text`,
			sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${
				sql.identifier('applied_at')
			} timestamp with time zone DEFAULT now()`,
		];
		for (const { id, name } of toApply) {
			sqls.push(
				sql`UPDATE ${table} SET ${sql.identifier('name')} = ${name}, ${sql.identifier('applied_at')} = NULL WHERE ${
					sql.identifier('id')
				} = ${id}`,
			);
		}

		// check if http
		// execute -> proxy, http drivers
		// transaction -> other
		if (mode === 'transaction') {
			await db.transaction(async (tx: PgAsyncTransaction<any, any, any>) => {
				for (const sql of sqls) {
					await tx.execute(sql);
				}
			});
		} else if (mode === 'batch') {
			const database = db as NeonHttpDatabase;

			await database.batch(
				sqls.map((s) => database.execute(s)) as unknown as [BatchItem<'pg'>, ...BatchItem<'pg'>[]],
			);
		} else {
			for (const sql of sqls) {
				await db.execute(sql);
			}
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
	db: PgAsyncDatabase<PgQueryResultHKT, any, any, any>,
	localMigrations: MigrationMeta[],
	mode: 'transaction' | 'execute' | 'batch' = 'transaction',
): Promise<UpgradeResult> {
	// Check if the table exists at all
	const result = await execute<{ '1': 1 }[]>(
		db.session,
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
		db.session,
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
		const upgradeFn = upgradeFunctions[v];
		if (!upgradeFn) {
			throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
		}
		await upgradeFn(migrationsSchema, migrationsTable, db, localMigrations, mode);
	}

	return { prevVersion: version, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
}
