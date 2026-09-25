import { readMigrationFiles } from 'drizzle-orm/migrator';
import fetch, { Response } from 'node-fetch';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { connectToSQLite } from '../../src/cli/connections';

vi.mock('node-fetch', async (importOriginal) => ({
	...await importOriginal<typeof import('node-fetch')>(),
	default: vi.fn(),
}));

let sqlite: DatabaseSync;
let migrationsFolder: string;

const connect = () =>
	connectToSQLite({ driver: 'd1-http', accountId: 'account', databaseId: 'database', token: 'token' });
const writeMigration = (name: string, sql: string) => {
	const folder = join(migrationsFolder, name);
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, 'migration.sql'), sql);
};

beforeEach(() => {
	sqlite = new DatabaseSync(':memory:');
	migrationsFolder = mkdtempSync(join(tmpdir(), 'drizzle-d1-migrate-'));
	vi.mocked(fetch).mockImplementation(async (url, options) => {
		const { sql, params } = z.object({
			sql: z.string(),
			params: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
		}).parse(JSON.parse(String(options?.body)));
		if (!params) {
			sqlite.exec(sql);
			return new Response(JSON.stringify({ success: true, result: [{ results: [] }] }));
		}
		const statement = sqlite.prepare(sql);
		const raw = String(url).endsWith('/raw');
		statement.setReturnArrays(raw);
		const rows = statement.all(...params);
		const results = raw ? { columns: statement.columns().map((column) => column.name), rows } : rows;
		return new Response(JSON.stringify({ success: true, result: [{ results }] }));
	});
});

afterEach(() => {
	vi.resetAllMocks();
	sqlite.close();
	rmSync(migrationsFolder, { recursive: true, force: true });
});

test('applies only pending D1 migrations after the first run', async () => {
	const db = await connect();
	writeMigration('20260901000000_initial', 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);');
	await db.migrate({ migrationsFolder });
	await db.migrate({ migrationsFolder });

	writeMigration('20260902000000_insert', "INSERT INTO users VALUES (1, 'Alice');");
	await db.migrate({ migrationsFolder });
	await db.migrate({ migrationsFolder });

	expect(await db.query('SELECT name FROM __drizzle_migrations ORDER BY id')).toEqual([
		{ name: '20260901000000_initial' },
		{ name: '20260902000000_insert' },
	]);
	expect(await db.query('SELECT * FROM users')).toEqual([{ id: 1, name: 'Alice' }]);
});

test('upgrades an existing D1 migration journal without replaying migrations', async () => {
	const initial = 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);';
	writeMigration('20260901000000_initial', initial);
	const [migration] = readMigrationFiles({ migrationsFolder });
	sqlite.exec(initial);
	sqlite.exec('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC);');
	sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
		migration.hash,
		migration.folderMillis,
	);
	sqlite.exec("INSERT INTO users VALUES (1, 'Alice');");

	const db = await connect();
	await db.migrate({ migrationsFolder });
	await db.migrate({ migrationsFolder });

	expect(await db.query('SELECT id, hash, created_at, name FROM __drizzle_migrations')).toEqual([
		{ id: 1, hash: migration.hash, created_at: migration.folderMillis, name: migration.name },
	]);
	expect(await db.query('SELECT * FROM users')).toEqual([{ id: 1, name: 'Alice' }]);
});

test('preserves named query rows and both Studio result modes', async () => {
	const db = await connect();
	const sql = 'SELECT ? AS value';
	const params = [42];
	expect(await db.query(sql, params)).toEqual([{ value: 42 }]);
	expect(await db.proxy({ sql, params, mode: 'object', method: 'all' })).toEqual([{ value: 42 }]);
	expect(await db.proxy({ sql, params, mode: 'array', method: 'all' })).toEqual([[42]]);
});
