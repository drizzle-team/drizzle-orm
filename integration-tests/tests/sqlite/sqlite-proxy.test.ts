/* eslint-disable drizzle-internal/require-entity-kind */
import type BetterSqlite3 from 'better-sqlite3';
import Database from 'better-sqlite3';
import { Name, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { drizzle as proxyDrizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { randomString } from '~/utils';
import relations from './relations';
import { anotherUsersMigratorTable, tests, usersMigratorTable, usersTable } from './sqlite-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './sqlite-common-cache';

const ENABLE_LOGGING = false;

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

let db: SqliteRemoteDatabase<never, typeof relations>;
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
	db = proxyDrizzle(callback, {
		logger: ENABLE_LOGGING,
		relations,
	});
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

test('migrator', async () => {
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, async (queries) => {
		try {
			await serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, { migrationsFolder: './drizzle2/sqlite' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result = await db.select().from(usersMigratorTable).all();

	await db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result2 = await db.select().from(anotherUsersMigratorTable).all();

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table __drizzle_migrations`);
});

test('migrator : migrate with custom table', async () => {
	const customTable = randomString();
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists ${sql.identifier(customTable)}`);

	await migrate(db, async (queries) => {
		try {
			await serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, { migrationsFolder: './drizzle2/sqlite', migrationsTable: customTable });

	// test if the custom migrations table was created
	const res = await db.all(sql`select * from ${sql.identifier(customTable)};`);
	expect(res.length > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table ${sql.identifier(customTable)}`);
});

test('migrator : --init', async () => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	const migratorRes = await migrate(db, async (queries) => {
		try {
			await serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, {
		migrationsFolder: './drizzle2/sqlite',

		migrationsTable,
		// @ts-ignore - internal param
		init: true,
	});

	const meta = await db.select({
		hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
		createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
	}).from(sql`${sql.identifier(migrationsTable)}`);

	const res = await db.get<[number]>(
		sql`SELECT EXISTS (SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${
			getTableConfig(usersMigratorTable).name
		}) AS ${sql.identifier('tableExists')};`,
	);

	expect(migratorRes).toStrictEqual(undefined);
	expect(meta.length).toStrictEqual(1);
	expect(!!res?.[0]).toStrictEqual(false);
});

test('migrator : --init - local migrations error', async () => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	const migratorRes = await migrate(db, async (queries) => {
		try {
			await serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, {
		migrationsFolder: './drizzle2/sqlite-init',

		migrationsTable,
		// @ts-ignore - internal param
		init: true,
	});

	const meta = await db.select({
		hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
		createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
	}).from(sql`${sql.identifier(migrationsTable)}`);

	const res = await db.get<[number]>(
		sql`SELECT EXISTS (SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${
			getTableConfig(usersMigratorTable).name
		}) AS ${sql.identifier('tableExists')};`,
	);

	expect(migratorRes).toStrictEqual({ exitCode: 'localMigrations' });
	expect(meta.length).toStrictEqual(0);
	expect(!!res?.[0]).toStrictEqual(false);
});

test('migrator : --init - db migrations error', async () => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	await migrate(db, async (queries) => {
		try {
			await serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, {
		migrationsFolder: './drizzle2/sqlite',
		migrationsTable,
	});

	const migratorRes = await migrate(db, async (queries) => {
		try {
			await serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, {
		migrationsFolder: './drizzle2/sqlite-init',

		migrationsTable,
		// @ts-ignore - internal param
		init: true,
	});

	const meta = await db.select({
		hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
		createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
	}).from(sql`${sql.identifier(migrationsTable)}`);

	const res = await db.get<[number]>(
		sql`SELECT EXISTS (SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${
			getTableConfig(usersMigratorTable).name
		}) AS ${sql.identifier('tableExists')};`,
	);

	expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
	expect(meta.length).toStrictEqual(1);
	expect(!!res?.[0]).toStrictEqual(true);
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
