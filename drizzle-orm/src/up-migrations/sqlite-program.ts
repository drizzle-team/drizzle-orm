import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import { perform, type QueryProgram } from '~/runtime/core.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import { GET_VERSION_FOR, type MigrationRunner, type UpgradeResult } from './utils.ts';

/**
 * Upgrade from version 0 to version 1:
 * 1. Read all existing DB migrations
 * 2. Sort localMigrations ASC by millis and if the same - sort by name
 * 3. Match each DB row to a local migration
 * If multiple migrations share the same second, use hash matching as a tiebreaker
 * Not implemented for now -> If hash matching fails, fall back to serial id ordering
 * 5. Create extra column and backfill names for matched migrations
 */
function* upToV1(
	migrationsTable: string,
	runner: MigrationRunner,
	localMigrations: MigrationMeta[],
): QueryProgram<void> {
	const table = sql`${sql.identifier(migrationsTable)}`;

	// 1. Read all existing DB migrations
	// Sort them by ids asc (order how they were applied)
	// this can be null from legacy implementation where id was serial
	const dbRows = yield* perform<{ id: number | null; hash: string; created_at: number }[]>(
		runner.objects(sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`, ['id', 'hash', 'created_at']),
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

	yield* perform(runner.atomically(statements));
}

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at)
 */
export function* upgradeIfNeeded(
	migrationsTable: string,
	runner: MigrationRunner,
	localMigrations: MigrationMeta[],
): QueryProgram<UpgradeResult> {
	// Check if the table exists at all
	const tableExists = yield* perform<unknown[]>(
		runner.objects(sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${migrationsTable}`, ['1']),
	);

	if (tableExists.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	const rows = yield* perform<{ column_name: string }[]>(
		runner.objects(sql`SELECT name as column_name FROM pragma_table_info(${migrationsTable})`, ['column_name']),
	);

	const version = GET_VERSION_FOR.sqlite(rows.map((r) => r.column_name));

	if (version < 1) yield* upToV1(migrationsTable, runner, localMigrations);

	return { newDb: false };
}

/**
 * Applies the migrations that the database doesn't have yet, all or none of them. With `init`, records the single
 * local migration as applied, or gives the reason it can't
 */
export function* migrate(
	migrations: MigrationMeta[],
	runner: MigrationRunner,
	config?: string | Omit<MigrationConfig, 'migrationsFolder'>,
): QueryProgram<void | MigratorInitFailResponse> {
	const migrationsTable = typeof config === 'object'
		? config.migrationsTable ?? '__drizzle_migrations'
		: '__drizzle_migrations';
	const table = sql.identifier(migrationsTable);
	const record = (migration: MigrationMeta) =>
		sql`insert into ${table} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${
			new Date().toISOString()
		})`;

	// Detect DB version and upgrade table schema if needed
	const { newDb } = yield* upgradeIfNeeded(migrationsTable, runner, migrations);

	// Create table with latest schema (version 1) if this is a new database
	if (newDb) {
		yield* perform(
			runner.execute(sql`
				CREATE TABLE IF NOT EXISTS ${table} (
					id INTEGER PRIMARY KEY,
					hash text NOT NULL,
					created_at numeric,
					name text,
					applied_at TEXT
				)
			`),
		);
	}

	const dbMigrations = yield* perform<{ id: number; hash: string; created_at: string; name: string | null }[]>(
		runner.objects(sql`SELECT id, hash, created_at, name FROM ${table}`, ['id', 'hash', 'created_at', 'name']),
	);

	if (typeof config === 'object' && config.init) {
		if (dbMigrations.length) return { exitCode: 'databaseMigrations' as const };
		if (migrations.length > 1) return { exitCode: 'localMigrations' as const };

		const [migration] = migrations;
		if (!migration) return;

		yield* perform(runner.atomically([record(migration)]));
		return;
	}

	const statements: SQL[] = [];
	for (const migration of getMigrationsToRun({ localMigrations: migrations, dbMigrations })) {
		for (const statement of migration.sql) statements.push(sql.raw(statement));
		statements.push(record(migration));
	}

	if (statements.length) yield* perform(runner.atomically(statements));
}
