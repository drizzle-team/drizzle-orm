import { Name, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import { expect } from 'vitest';
import { randomString } from '~/utils';
import { proxyTest as test } from './instrumentation';
import relations from './relations';
import { anotherUsersMigratorTable, tests, usersMigratorTable, usersTable } from './sqlite-common';
import { tests as cacheTests } from './sqlite-common-cache';

const skip = [
	// Different driver respond
	'insert via db.get w/ query builder',
	'insert via db.run + select via db.get',
	'insert via db.get',
	'insert via db.run + select via db.all',
];
cacheTests(test, skip);
tests(test, skip);

test.beforeEach(async ({ db }) => {
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

test('migrator', async ({ db, serverSimulator }) => {
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists __drizzle_migrations`);

	await migrate(db as SqliteRemoteDatabase<never, typeof relations>, async (queries) => {
		try {
			serverSimulator.migrations(queries);
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

test('migrator : migrate with custom table', async ({ db, serverSimulator }) => {
	const customTable = randomString();
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists ${sql.identifier(customTable)}`);

	await migrate(db as SqliteRemoteDatabase<never, typeof relations>, async (queries) => {
		try {
			serverSimulator.migrations(queries);
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

test('migrator : --init', async ({ db, serverSimulator }) => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	const migratorRes = await migrate(db as SqliteRemoteDatabase<never, typeof relations>, async (queries) => {
		try {
			serverSimulator.migrations(queries);
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

test('migrator : --init - local migrations error', async ({ db, serverSimulator }) => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	const migratorRes = await migrate(db as SqliteRemoteDatabase<never, typeof relations>, async (queries) => {
		try {
			serverSimulator.migrations(queries);
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

test('migrator : --init - db migrations error', async ({ db, serverSimulator }) => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	await migrate(db as SqliteRemoteDatabase<never, typeof relations>, async (queries) => {
		try {
			serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, {
		migrationsFolder: './drizzle2/sqlite',
		migrationsTable,
	});

	const migratorRes = await migrate(db as SqliteRemoteDatabase<never, typeof relations>, async (queries) => {
		try {
			serverSimulator.migrations(queries);
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

test('insert via db.get w/ query builder', async ({ db }) => {
	const inserted = await db.get<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	expect(inserted).toEqual([1, 'John']);
});

test('insert via db.run + select via db.get', async ({ db }) => {
	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.get<{ id: number; name: string }>(
		sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
	);
	expect(result).toEqual([1, 'John']);
});

test('insert via db.get', async ({ db }) => {
	const inserted = await db.get<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${new Name(
			usersTable.name.name,
		)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	expect(inserted).toEqual([1, 'John']);
});

test('insert via db.run + select via db.all', async ({ db }) => {
	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.all<{ id: number; name: string }>(sql`select id, name from "users"`);
	expect(result).toEqual([[1, 'John']]);
});
