import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { migrate, rollback } from 'drizzle-orm/pg-proxy/migrator';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, expect, test } from 'vitest';

// PGlite stands behind the proxy handler, and the migrations callback runs each call in a transaction,
// which is the contract the pg-proxy docs ask of a proxy server.
let pg: PGlite;
let folder: string;
let calls: string[][];

const handler = async (query: string, params: unknown[], method: 'all' | 'execute') => {
	const result = await pg.query(query, params as any[], { rowMode: method === 'all' ? 'array' : 'object' });
	return { rows: result.rows as any[] };
};

const runMigrations = async (queries: string[]) => {
	calls.push(queries);
	await pg.transaction(async (tx) => {
		for (const query of queries) await tx.exec(query);
	});
};

beforeEach(() => {
	pg = new PGlite();
	calls = [];
	folder = mkdtempSync(join(tmpdir(), 'drizzle-pg-proxy-rollback-'));
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

async function journal() {
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

test('rollback hands down statements and the journal delete to the callback in one call', async () => {
	const db = drizzle(handler);
	writeMigration('20240101000000_a', 'CREATE TABLE "proxy_a" ("id" integer);', 'DROP TABLE "proxy_a";');
	writeMigration(
		'20240102000000_b',
		'CREATE TABLE "proxy_z" ("id" integer);\n--> statement-breakpoint\nCREATE TABLE "proxy_b" ("id" integer);',
		'DROP TABLE "proxy_z";\n--> statement-breakpoint\nDROP TABLE "proxy_b";',
	);
	await migrate(db, runMigrations, { migrationsFolder: folder });
	calls = [];

	const plan = await rollback(db, runMigrations, { migrationsFolder: folder }, { steps: 2 });

	expect(plan.map((step) => step.name)).toStrictEqual(['20240102000000_b', '20240101000000_a']);
	expect(calls).toHaveLength(1);
	expect(calls[0]!.map((query) => query.trim())).toStrictEqual([
		'DROP TABLE "proxy_z";',
		'DROP TABLE "proxy_b";',
		expect.stringMatching(/^delete from "drizzle"\."__drizzle_migrations" where id = \d+$/),
		'DROP TABLE "proxy_a";',
		expect.stringMatching(/^delete from "drizzle"\."__drizzle_migrations" where id = \d+$/),
	]);
	expect(await tableExists('proxy_a')).toBe(false);
	expect(await tableExists('proxy_b')).toBe(false);
	expect(await journal()).toStrictEqual([]);
});

test('dryRun never calls the callback', async () => {
	const db = drizzle(handler);
	writeMigration('20240101000000_a', 'CREATE TABLE "proxy_a" ("id" integer);', 'DROP TABLE "proxy_a";');
	await migrate(db, runMigrations, { migrationsFolder: folder });
	calls = [];

	const plan = await rollback(db, runMigrations, { migrationsFolder: folder }, { dryRun: true });

	expect(plan.map((step) => step.name)).toStrictEqual(['20240101000000_a']);
	expect(calls).toStrictEqual([]);
	expect(await tableExists('proxy_a')).toBe(true);
	expect(await journal()).toStrictEqual(['20240101000000_a']);
});
