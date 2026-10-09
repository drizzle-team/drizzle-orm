import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { readMigrationFiles } from '~/migrator';
import type { DsqlAsyncDatabase } from '~/pg-core/async/dsql/db';
import { migrate, rollback } from '~/pg-core/async/dsql/migrator';
import { PgDialect } from '~/pg-core/dialect';
import type { SQL } from '~/sql/sql';

// The DSQL migrator only touches `db.execute` and `db.session.{objects,execute}`, so PGlite behind those
// three stands in for Aurora DSQL. Every statement is recorded to observe what ran, and in what order.
let pg: PGlite;
let db: DsqlAsyncDatabase<any, any>;
let executed: string[];
let folder: string;

beforeEach(() => {
	pg = new PGlite();
	executed = [];

	const dialect = new PgDialect();
	const run = async (query: SQL) => {
		const { sql, params } = dialect.sqlToQuery(query);
		executed.push(sql.trim());
		return (await pg.query(sql, params as any[])).rows;
	};
	db = { execute: run, session: { objects: run, execute: run } } as any;
	folder = mkdtempSync(join(tmpdir(), 'drizzle-dsql-rollback-'));
});

afterEach(async () => {
	rmSync(folder, { recursive: true, force: true });
	await pg.close();
});

function writeMigration(name: string, up: string, down?: string) {
	mkdirSync(join(folder, name), { recursive: true });
	writeFileSync(join(folder, name, 'migration.sql'), up);
	if (down !== undefined) writeFileSync(join(folder, name, 'down.sql'), down);
}

async function applyAll() {
	const migrations = readMigrationFiles({ migrationsFolder: folder });
	await migrate(migrations, db, { migrationsFolder: folder });
	executed = [];
	return migrations;
}

async function journalNames() {
	const result = await pg.query<{ name: string }>('select name from "drizzle"."__drizzle_migrations" order by id');
	return result.rows.map((row) => row.name);
}

async function tableExists(name: string) {
	const result = await pg.query<{ exists: boolean }>(
		'select exists (select 1 from pg_tables where tablename = $1) as "exists"',
		[name],
	);
	return result.rows[0]!.exists;
}

test('rollback runs the latest down.sql in file order, then removes its journal row', async () => {
	writeMigration('20240101000000_a', 'CREATE TABLE "a" ("id" integer)', 'DROP TABLE "a"');
	writeMigration(
		'20240102000000_b',
		'CREATE TABLE "b" ("id" integer);\n--> statement-breakpoint\nCREATE INDEX "b_idx" ON "b" ("id")',
		'DROP INDEX "b_idx";\n--> statement-breakpoint\nDROP TABLE "b"',
	);
	const migrations = await applyAll();

	await rollback(migrations, db, { migrationsFolder: folder });

	expect(executed.slice(1)).toStrictEqual([
		'DROP INDEX "b_idx";',
		'DROP TABLE "b"',
		'delete from "drizzle"."__drizzle_migrations" where id = $1',
	]);
	expect(await tableExists('a')).toBe(true);
	expect(await tableExists('b')).toBe(false);
	expect(await journalNames()).toStrictEqual(['20240101000000_a']);
});

test('rollback with steps walks back newest-first', async () => {
	writeMigration('20240101000000_a', 'CREATE TABLE "a" ("id" integer)', 'DROP TABLE "a"');
	writeMigration('20240102000000_b', 'CREATE TABLE "b" ("a_id" integer)', 'DROP TABLE "b"');
	const migrations = await applyAll();

	await rollback(migrations, db, { migrationsFolder: folder }, { steps: 2 });

	expect(executed.filter((sql) => sql.startsWith('DROP'))).toStrictEqual(['DROP TABLE "b"', 'DROP TABLE "a"']);
	expect(await journalNames()).toStrictEqual([]);
});

test('dryRun returns the plan without executing anything', async () => {
	writeMigration('20240101000000_a', 'CREATE TABLE "a" ("id" integer)', 'DROP TABLE "a"');
	const migrations = await applyAll();

	const plan = await rollback(migrations, db, { migrationsFolder: folder }, { dryRun: true });

	expect(plan).toMatchObject([{ name: '20240101000000_a', downSql: ['DROP TABLE "a"'] }]);
	expect(executed).toHaveLength(1);
	expect(await tableExists('a')).toBe(true);
	expect(await journalNames()).toStrictEqual(['20240101000000_a']);
});

// Non-atomic rollback must refuse up front: a missing down.sql discovered mid-way would strand the database
// between versions with nothing to undo the steps already taken.
test('a missing down.sql anywhere in the range fails before any statement runs', async () => {
	writeMigration('20240101000000_a', 'CREATE TABLE "a" ("id" integer)');
	writeMigration('20240102000000_b', 'CREATE TABLE "b" ("id" integer)', 'DROP TABLE "b"');
	const migrations = await applyAll();

	await expect(rollback(migrations, db, { migrationsFolder: folder }, { steps: 2 })).rejects.toThrow(/has no down SQL/);

	expect(executed).toHaveLength(1);
	expect(await tableExists('b')).toBe(true);
	expect(await journalNames()).toStrictEqual(['20240101000000_a', '20240102000000_b']);
});

test('a failing down statement leaves earlier steps applied, with the journal matching the database', async () => {
	writeMigration('20240101000000_a', 'CREATE TABLE "a" ("id" integer)', 'DROP TABLE "missing"');
	writeMigration('20240102000000_b', 'CREATE TABLE "b" ("id" integer)', 'DROP TABLE "b"');
	const migrations = await applyAll();

	await expect(rollback(migrations, db, { migrationsFolder: folder }, { steps: 2 })).rejects.toThrow();

	expect(await tableExists('b')).toBe(false);
	expect(await tableExists('a')).toBe(true);
	expect(await journalNames()).toStrictEqual(['20240101000000_a']);
});
