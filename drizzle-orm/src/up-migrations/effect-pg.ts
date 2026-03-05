import { Effect } from 'effect';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import type { MigrationMeta } from '~/migrator.ts';
import type { PgEffectSession } from '~/pg-core/effect/session.ts';
import { sql } from '~/sql/sql.ts';

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
 * Map of upgrade functions. Each key is the version being upgraded FROM,
 * and the function upgrades the table to the next version.
 */
const upgradeFunctions: Record<
	number,
	<TEffectHKT extends QueryEffectHKTBase>(
		migrationsSchema: string,
		migrationsTable: string,
		session: PgEffectSession<TEffectHKT>,
		localMigrations: MigrationMeta[],
	) => Effect.Effect<void, TEffectHKT['error'], TEffectHKT['context']>
> = {
	/**
	 * Upgrade from version 0 to version 1:
	 * 1. Add `name` column (text)
	 * 2. Add `applied_at` column (timestamp with time zone, defaults to now())
	 * 3. Backfill `name` for existing rows by matching `created_at` (millis) to local migration folder timestamps
	 * 4. If multiple migrations share the same second, use hash matching as a tiebreaker
	 * Not implemented for now -> 5. If hash matching fails, fall back to serial id ordering
	 */
	0: (migrationsSchema, migrationsTable, session, localMigrations) => {
		return Effect.gen(function*() {
			const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

			// 1. Add new columns
			yield* session.execute(sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "name" text`);
			yield* session.execute(
				sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "applied_at" timestamp with time zone DEFAULT now()`,
			);

			// 2. Read all existing DB migrations
			// Sort them by ids asc (order how they were applied)
			const dbRows = yield* session.all<{ id: number; hash: string; created_at: string }>(
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

				if (candidates && candidates.length === 1) {
					matched = candidates[0];
				} else if (candidates && candidates.length > 1) {
					matched = candidates.find((c) => c.hash === dbRow.hash);
				} else {
					matched = byHash.get(dbRow.hash);
				}

				yield* session.execute(
					sql`UPDATE ${table} SET name = ${matched?.name ?? null}, applied_at = NULL WHERE id = ${dbRow.id}`,
				);
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
export const upgradeIfNeeded: <TEffectHKT extends QueryEffectHKTBase>(
	migrationsSchema: string,
	migrationsTable: string,
	session: PgEffectSession<TEffectHKT>,
	localMigrations: MigrationMeta[],
) => Effect.Effect<UpgradeResult, TEffectHKT['error'], TEffectHKT['context']> = Effect.fn('upgradeIfNeeded')(
	function*<TEffectHKT extends QueryEffectHKTBase>(
		migrationsSchema: string,
		migrationsTable: string,
		session: PgEffectSession<TEffectHKT>,
		localMigrations: MigrationMeta[],
	) {
		// Check if the table exists at all
		const result = yield* session.all(
			sql`SELECT 1 FROM information_schema.tables
			WHERE table_schema = ${migrationsSchema}
			AND table_name = ${migrationsTable}`,
		);

		if (result.length === 0) {
			return { newDb: true };
		}

		// Table exists, check table shape
		const rows = yield* session.all<{ schema: string; table_name: string; column_name: string; type: string }>(
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

		const version = getVersion(rows.map((r) => r.column_name));

		for (let v = version; v < CURRENT_MIGRATION_TABLE_VERSION; v++) {
			const upgradeFn = upgradeFunctions[v];
			if (!upgradeFn) {
				throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
			}
			yield* upgradeFn(migrationsSchema, migrationsTable, session, localMigrations);
		}

		return { prevVersion: version, currentVersion: CURRENT_MIGRATION_TABLE_VERSION };
	},
);
