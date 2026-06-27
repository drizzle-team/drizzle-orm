import { Effect } from 'effect';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import type { MigrationMeta } from '~/migrator.ts';
import { sql } from '~/sql/sql.ts';
import type { SQLiteEffectSession } from '~/sqlite-core/effect/session.ts';
import { GET_VERSION_FOR, MIGRATIONS_TABLE_VERSIONS, type UpgradeResult } from './utils.ts';

/**
 * Map of upgrade functions. Each key is the version being upgraded FROM,
 * and the function upgrades the table to the next version.
 */
const upgradeFunctions: Record<
	number,
	<TEffectHKT extends QueryEffectHKTBase>(
		migrationsTable: string,
		session: SQLiteEffectSession<any, TEffectHKT>,
		localMigrations: MigrationMeta[],
	) => Effect.Effect<void, TEffectHKT['error'], TEffectHKT['context']>
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
		return Effect.gen(function*() {
			const table = sql`${sql.identifier(migrationsTable)}`;

			// 1. Read all existing DB migrations
			// Sort them by ids asc (order how they were applied)
			// this can be null from legacy implementation where id was serial
			const dbRows = yield* session.objects<{ id: number | null; hash: string; created_at: number }>(
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
					matched = candidates.find((c) => c.hash && dbRow.hash && c.hash === dbRow.hash);
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
			if (unmatched.length > 0) {
				throw Error(
					`While upgrading your database migrations table we found ${unmatched.length} (${
						unmatched.map((it) => `[id: ${it.id}, created_at: ${it.created_at}]`).join(', ')
					}) migrations in the database that do not match any local migration. This means that some migrations were applied to the database but are missing from the local environment`,
				);
			}

			// 5. Create extra column and backfill names for matched migrations
			yield* session.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.run(sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier('name')} text`);
					yield* tx.run(
						sql`ALTER TABLE ${table} ADD COLUMN ${sql.identifier('applied_at')} TEXT`,
					);

					for (const backfillEntry of toApply) {
						const updateQuery = sql`UPDATE ${table} SET ${sql.identifier('name')} = ${backfillEntry.name}, ${
							sql.identifier('applied_at')
						} = NULL WHERE`;

						if (backfillEntry.id) updateQuery.append(sql` ${sql.identifier('id')} = ${backfillEntry.id}`);
						else if (backfillEntry.matchedBy === 'millis') {
							updateQuery.append(sql` ${sql.identifier('created_at')} = ${backfillEntry.created_at}`);
						} else updateQuery.append(sql` ${sql.identifier('hash')} = ${backfillEntry.hash}`);

						yield* tx.run(updateQuery);
					}
				})
			);
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
	migrationsTable: string,
	session: SQLiteEffectSession<any, TEffectHKT>,
	localMigrations: MigrationMeta[],
) => Effect.Effect<UpgradeResult, TEffectHKT['error'], TEffectHKT['context']> = Effect.fn('upgradeIfNeeded')(
	function*<TEffectHKT extends QueryEffectHKTBase>(
		migrationsTable: string,
		session: SQLiteEffectSession<any, TEffectHKT>,
		localMigrations: MigrationMeta[],
	) {
		const tableExists = yield* session.objects(
			sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`,
		);

		if (tableExists.length === 0) {
			return { newDb: true };
		}

		const rows = yield* session.objects<{ column_name: string }>(
			sql`SELECT name as column_name FROM pragma_table_info(${migrationsTable})`,
		);

		const version = GET_VERSION_FOR.sqlite(rows.map((r) => r.column_name));

		for (let v = version; v < MIGRATIONS_TABLE_VERSIONS.sqlite; v++) {
			const upgradeFn = upgradeFunctions[v];
			if (!upgradeFn) {
				throw new Error(`No upgrade path from migration table version ${v} to ${v + 1}`);
			}
			yield* upgradeFn(migrationsTable, session, localMigrations);
		}

		return { newDb: false };
	},
);
