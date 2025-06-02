/* eslint-disable drizzle-internal/require-entity-kind */
import type BetterSqlite3 from 'better-sqlite3';
import Database from 'better-sqlite3';
import { Name, sql } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { drizzle as proxyDrizzle } from 'drizzle-orm/sqlite-proxy';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { tests, usersTable } from './sqlite-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './sqlite-common-cache';

class ServerSimulator {
	constructor(private db: BetterSqlite3.Database) {}

	async query(sql: string, params: any[], method: string) {
		if (method === 'run') {
			try {
				const result = this.db.prepare(sql).run(params);
				return { data: result as any };
			} catch (e: any) {
				return { error: e.message };
			}
		} else if (method === 'all' || method === 'values') {
			try {
				const rows = this.db.prepare(sql).raw().all(params);
				return { data: rows };
			} catch (e: any) {
				return { error: e.message };
			}
		} else if (method === 'get') {
			try {
				const row = this.db.prepare(sql).raw().get(params);
				return { data: row };
			} catch (e: any) {
				return { error: e.message };
			}
		} else {
			return { error: 'Unknown method value' };
		}
	}

	migrations(queries: string[]) {
		this.db.exec('BEGIN');
		try {
			for (const query of queries) {
				this.db.exec(query);
			}
			this.db.exec('COMMIT');
		} catch {
			this.db.exec('ROLLBACK');
		}

		return {};
	}
}

let db: SqliteRemoteDatabase;
let dbGlobalCached: SqliteRemoteDatabase;
let cachedDb: SqliteRemoteDatabase;
let client: Database.Database;
let serverSimulator: ServerSimulator;

beforeAll(async () => {
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';
	client = new Database(dbPath);
	serverSimulator = new ServerSimulator(client);

	const callback = async (sql: string, params: any[], method: string) => {
		try {
			const rows = await serverSimulator.query(sql, params, method);

			if (rows.error !== undefined) {
				throw new Error(rows.error);
			}

			return { rows: rows.data };
		} catch (e: any) {
			console.error('Error from sqlite proxy server:', e.response?.data ?? e.message);
			throw e;
		}
	};
	db = proxyDrizzle(callback);
	cachedDb = proxyDrizzle(callback, { cache: new TestCache() });
	dbGlobalCached = proxyDrizzle(callback, { cache: new TestGlobalCache() });
});

beforeEach((ctx) => {
	ctx.sqlite = {
		db,
	};
	ctx.cachedSqlite = {
		db: cachedDb,
		dbGlobalCached,
	};
});

afterAll(async () => {
	client?.close();
});

skipTests([
	// Different driver respond
	'insert via db.get w/ query builder',
	'insert via db.run + select via db.get',
	'insert via db.get',
	'insert via db.run + select via db.all',
]);
cacheTests();
tests();

beforeEach(async () => {
	await db.run(sql`drop table if exists ${usersTable}`);

	await db.run(sql`
		create table ${usersTable} (
		 id integer primary key,
		 name text not null,
		 verified integer not null default 0,
		 json blob,
		 created_at integer not null default (strftime('%s', 'now'))
		)
	`);
});

test('insert via db.get w/ query builder', async () => {
	const inserted = await db.get<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	expect(inserted).toEqual([1, 'John']);
});

test('insert via db.run + select via db.get', async () => {
	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.get<{ id: number; name: string }>(
		sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
	);
	expect(result).toEqual([1, 'John']);
});

test('insert via db.get', async () => {
	const inserted = await db.get<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${new Name(
			usersTable.name.name,
		)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	expect(inserted).toEqual([1, 'John']);
});

test('insert via db.run + select via db.all', async (ctx) => {
	const { db } = ctx.sqlite;

	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.all<{ id: number; name: string }>(sql`select id, name from "users"`);
	expect(result).toEqual([[1, 'John']]);
});
