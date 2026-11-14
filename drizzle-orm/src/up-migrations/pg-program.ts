import type { MigrationConfig, MigrationMeta, MigratorInitFailResponse } from '~/migrator.ts';
import { getMigrationsToRun } from '~/migrator.utils.ts';
import { type Program, user } from '~/runtime/index.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import { GET_VERSION_FOR, type UpgradeResult } from './utils.ts';

/**
 * What the Postgres migrator needs from a database, for both runtimes: each method returns what the runtime runs,
 * a Promise for the async API or an Effect for the Effect API
 */
export interface PgMigrationRunner {
	execute(query: SQL): unknown;
	objects(query: SQL): unknown;
	/** Runs the statements so that all of them apply or none: in a transaction, or the driver's equivalent */
	atomically(statements: SQL[]): unknown;
}

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
	migrationsSchema: string,
	migrationsTable: string,
	runner: PgMigrationRunner,
	localMigrations: MigrationMeta[],
): Program<void> {
	const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;

	// 1. Read all existing DB migrations
	// Sort them by ids asc (order how they were applied)
	const dbRows = yield* user<{ id: number; hash: string; created_at: string }[]>(
		runner.objects(sql`SELECT id, hash, created_at FROM ${table} ORDER BY id ASC`),
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

	// 3. Match each DB row to a local migration
	//    Priority: millis -> hash
	const toApply: { id: number; name: string }[] = [];
	const unmatchedIds: number[] = [];

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
	const statements: SQL[] = [
		sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${sql.identifier('name')} text`,
		sql`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${
			sql.identifier('applied_at')
		} timestamp with time zone DEFAULT now()`,
	];
	for (const { id, name } of toApply) {
		statements.push(
			sql`UPDATE ${table} SET ${sql.identifier('name')} = ${name}, ${sql.identifier('applied_at')} = NULL WHERE ${
				sql.identifier('id')
			} = ${id}`,
		);
	}

	yield* user(runner.atomically(statements));
}

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at)
 */
export function* upgradeIfNeeded(
	migrationsSchema: string,
	migrationsTable: string,
	runner: PgMigrationRunner,
	localMigrations: MigrationMeta[],
): Program<UpgradeResult> {
	// Check if the table exists at all
	const result = yield* user<unknown[]>(
		runner.objects(
			sql`SELECT 1 FROM information_schema.tables
			WHERE table_schema = ${migrationsSchema}
			AND table_name = ${migrationsTable}`,
		),
	);

	if (result.length === 0) {
		return { newDb: true };
	}

	// Table exists, check table shape
	const rows = yield* user<{ schema: string; table_name: string; column_name: string; type: string }[]>(
		runner.objects(
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
		),
	);

	const version = GET_VERSION_FOR.pg(rows.map((r) => r.column_name));

	if (version < 1) yield* upToV1(migrationsSchema, migrationsTable, runner, localMigrations);

	return { newDb: false };
}

/**
 * Applies the migrations that the database doesn't have yet, in one transaction. With `init`, records the single
 * local migration as applied, or gives the reason it can't
 */
export function* migrate(
	migrations: MigrationMeta[],
	runner: PgMigrationRunner,
	config: string | MigrationConfig,
): Program<void | MigratorInitFailResponse> {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';
	const table = sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`;
	const record = (migration: MigrationMeta) =>
		sql`insert into ${table} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${
			migration.name ?? null
		})`;

	yield* user(runner.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`));

	// Detect DB version and upgrade table schema if needed
	const { newDb } = yield* upgradeIfNeeded(migrationsSchema, migrationsTable, runner, migrations);

	// Create table with latest schema (version 1) if this is a new database
	if (newDb) {
		yield* user(
			runner.execute(sql`
				CREATE TABLE IF NOT EXISTS ${table} (
					id SERIAL PRIMARY KEY,
					hash text NOT NULL,
					created_at bigint,
					name text,
					applied_at timestamp with time zone DEFAULT now()
				)
			`),
		);
	}

	const dbMigrations = yield* user<{ id: number; hash: string; created_at: string; name: string }[]>(
		runner.objects(sql`select id, hash, created_at, name from ${table}`),
	);

	if (typeof config === 'object' && config.init) {
		if (dbMigrations.length) return { exitCode: 'databaseMigrations' as const };
		if (migrations.length > 1) return { exitCode: 'localMigrations' as const };

		const [migration] = migrations;
		if (!migration) return;

		yield* user(runner.execute(record(migration)));
		return;
	}

	const statements: SQL[] = [];
	for (const migration of getMigrationsToRun({ localMigrations: migrations, dbMigrations })) {
		for (const statement of migration.sql) statements.push(sql.raw(statement));
		statements.push(record(migration));
	}

	yield* user(runner.atomically(statements));
}
