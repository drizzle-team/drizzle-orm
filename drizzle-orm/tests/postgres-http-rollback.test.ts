import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { construct, type PostgresHttpDatabase } from '~/postgres/http/driver-core';
import { migrate, rollback } from '~/postgres/http/migrator';
import type { PostgresHttpBatchQuery } from '~/postgres/http/session';

// The HTTP drivers have no interactive transactions, so `db.batch` is their only atomic primitive.
// PGlite stands in for the HTTP gateway here: `runBatch` maps a batch onto a real transaction, which
// is what lets these tests observe both the batching and the all-or-nothing behaviour it buys.
let pg: PGlite;
let db: PostgresHttpDatabase;
let batches: PostgresHttpBatchQuery[][];
let folder: string;

beforeEach(async () => {
	pg = new PGlite();
	batches = [];

	const client = {
		query: async (sql: string, params: unknown[], opts: { mode: 'array' | 'object' }) => {
			const result = await pg.query(sql, params as any[], {
				rowMode: opts.mode === 'array' ? 'array' : 'object',
			});
			return { rows: result.rows };
		},
	};

	const runBatch = async (queries: PostgresHttpBatchQuery[]) => {
		batches.push(queries);

		return await pg.transaction(async (tx) => {
			const results = [];
			for (const query of queries) {
				const result = await tx.query(query.sql, query.params as any[], {
					rowMode: query.mode === 'array' ? 'array' : 'object',
				});
				results.push({ rows: result.rows });
			}
			return results;
		}) as any;
	};

	db = construct(client as any, runBatch as any);
	folder = mkdtempSync(join(tmpdir(), 'drizzle-http-rollback-'));
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

async function journalNames() {
	const result = await pg.query<{ name: string }>(
		'select name from "drizzle"."__drizzle_migrations" order by id',
	);
	return result.rows.map((row) => row.name);
}

async function tableExists(name: string) {
	const result = await pg.query<{ exists: boolean }>(
		'select exists (select 1 from pg_tables where tablename = $1) as "exists"',
		[name],
	);
	return result.rows[0]!.exists;
}

function batchedSql() {
	return batches.map((batch) => batch.map((query) => query.sql.trim()));
}

test('rollback sends down statements and the journal delete as one batch', async () => {
	writeMigration(
		'20240101010101_users',
		'CREATE TABLE "http_users" ("id" serial PRIMARY KEY);',
		'DROP TABLE "http_users";',
	);
	writeMigration(
		'20240202020202_posts',
		'CREATE TABLE "http_posts" ("id" serial PRIMARY KEY);\n--> statement-breakpoint\nCREATE INDEX "http_posts_id" ON "http_posts" ("id");',
		'DROP INDEX "http_posts_id";\n--> statement-breakpoint\nDROP TABLE "http_posts";',
	);

	await migrate(db, { migrationsFolder: folder });
	batches = [];

	await rollback(db, { migrationsFolder: folder });

	// down.sql comes out of the reverse schema diff already in a dependency-safe order, so it runs
	// top-to-bottom: reordering it here would drop the table out from under the index drop.
	expect(batchedSql()).toStrictEqual([[
		'DROP INDEX "http_posts_id";',
		'DROP TABLE "http_posts";',
		'delete from "drizzle"."__drizzle_migrations" where id = $1',
	]]);
	expect(await journalNames()).toStrictEqual(['20240101010101_users']);
	expect(await tableExists('http_posts')).toBe(false);
	expect(await tableExists('http_users')).toBe(true);
});

test('rollback of several steps undoes migrations newest first', async () => {
	writeMigration(
		'20240101010101_users',
		'CREATE TABLE "http_users" ("id" serial PRIMARY KEY);',
		'DROP TABLE "http_users";',
	);
	writeMigration(
		'20240202020202_posts',
		'CREATE TABLE "http_posts" ("id" serial PRIMARY KEY);',
		'DROP TABLE "http_posts";',
	);

	await migrate(db, { migrationsFolder: folder });
	batches = [];

	await rollback(db, { migrationsFolder: folder }, 2);

	expect(batchedSql()).toStrictEqual([[
		'DROP TABLE "http_posts";',
		'delete from "drizzle"."__drizzle_migrations" where id = $1',
		'DROP TABLE "http_users";',
		'delete from "drizzle"."__drizzle_migrations" where id = $1',
	]]);
	expect(await journalNames()).toStrictEqual([]);
	expect(await tableExists('http_posts')).toBe(false);
	expect(await tableExists('http_users')).toBe(false);
});

test('a failing down statement discards the whole rollback', async () => {
	writeMigration(
		'20240101010101_users',
		'CREATE TABLE "http_users" ("id" serial PRIMARY KEY);',
		// The drop succeeds before the bad statement fails, so a non-atomic implementation would
		// leave the table gone but the journal row in place.
		'DROP TABLE "http_users";\n--> statement-breakpoint\nSELECT * FROM "http_missing";',
	);

	await migrate(db, { migrationsFolder: folder });

	await expect(rollback(db, { migrationsFolder: folder })).rejects.toThrowError(/http_missing/);

	expect(await journalNames()).toStrictEqual(['20240101010101_users']);
	expect(await tableExists('http_users')).toBe(true);
});

test('rollback rejects a migration that has no down.sql without touching the database', async () => {
	writeMigration('20240101010101_users', 'CREATE TABLE "http_users" ("id" serial PRIMARY KEY);');

	await migrate(db, { migrationsFolder: folder });
	batches = [];

	await expect(rollback(db, { migrationsFolder: folder })).rejects.toThrowError(/no down SQL available/);

	expect(batches).toStrictEqual([]);
	expect(await journalNames()).toStrictEqual(['20240101010101_users']);
	expect(await tableExists('http_users')).toBe(true);
});

test('rollback on an empty journal is a no-op', async () => {
	writeMigration(
		'20240101010101_users',
		'CREATE TABLE "http_users" ("id" serial PRIMARY KEY);',
		'DROP TABLE "http_users";',
	);

	await migrate(db, { migrationsFolder: folder });
	await rollback(db, { migrationsFolder: folder });
	batches = [];

	await rollback(db, { migrationsFolder: folder });

	expect(batches).toStrictEqual([]);
});
